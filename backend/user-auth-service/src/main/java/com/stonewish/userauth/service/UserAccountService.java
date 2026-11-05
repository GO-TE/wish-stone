package com.stonewish.userauth.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * [사수 멘토링 포인트 - user-auth-service (:8081)]
 * 1) 배틀태그 방식(닉네임#태그, D-015):
 *    - 단순 nickname UNIQUE를 걸면 흔한 이름("제미나이", "민수")을 선점당한 뒤 가입 이탈이 발생합니다.
 *    - (nickname, tag) 복합 유니크를 걸어 같은 닉네임이라도 "제미나이#real", "제미나이#4821"로 공존하게 합니다.
 *    - 사용자가 "#태그"를 직접 입력하면 그대로 검증해 쓰고, 생략하면 서버가 4자리 숫자 태그를 자동 생성합니다.
 * 2) 게스트 -> 소셜 계정 연결(link, D-007):
 *    - 새로운 userId를 발급하면 게스트 시절 쌓은 돌이 증발합니다.
 *    - 반드시 기존 게스트의 userId는 유지한 채 isGuest=false로 바꾸고 소셜 Identity만 연결해야 데이터가 보존됩니다.
 * 3) N-05 HMAC-SHA256 서명 JWT 발급 및 검증:
 *    - 단순 평문(`uid:...`) 토큰 대신 RFC 7519 표준 `header.payload.signature` 포맷으로 HMAC-SHA256 서명하여
 *      클라이언트 측 페이로드 변조(Tampering) 및 만료(exp) 토큰 재사용을 원천 차단합니다.
 */
@Service
public class UserAccountService {

    public static final String DEFAULT_JWT_SECRET = "stonewish-default-hmac-sha256-secret-key-2026-secure";
    public static final long DEFAULT_TTL_SECONDS = 604800L; // 7 days

    private static final Set<String> FORBIDDEN_IMPERSONATION_WORDS = Set.of(
        "관리자", "운영자", "admin", "system", "stonewish"
    );
    private static final Set<String> VALID_PROVIDERS = Set.of("guest", "kakao", "google", "apple");
    private static final String TAG_PATTERN = "^[a-zA-Z0-9가-힣]{2,10}$";
    private static final Pattern SUB_PATTERN = Pattern.compile("\"sub\"\\s*:\\s*\"([^\"]+)\"");
    private static final Pattern GUEST_PATTERN = Pattern.compile("\"guest\"\\s*:\\s*(true|false)");
    private static final Pattern EXP_PATTERN = Pattern.compile("\"exp\"\\s*:\\s*(\\d+)");

    public record NicknameWithTag(String nickname, String tag) {
        public String displayName() {
            return nickname + "#" + tag;
        }
    }

    public record UserAccount(
        String id,
        String nickname,
        String tag,
        boolean isGuest,
        String linkedProvider
    ) {
        public String displayName() {
            if (nickname == null || tag == null) return null;
            return nickname + "#" + tag;
        }
    }

    public record AuthTokenResult(
        String accessToken,
        UserAccount user
    ) {}

    public record VerifiedJwtClaims(
        String userId,
        boolean isGuest,
        long exp
    ) {}

    public interface UserAccountPort {
        UserAccount findById(String userId);
        boolean existsByNicknameAndTag(String nickname, String tag, String excludeUserId);
        UserAccount save(UserAccount account);
        List<UserAccount> findByIds(List<String> userIds);

        default void deleteOrAnonymize(String userId) {
            UserAccount existing = findById(userId);
            if (existing != null) {
                save(new UserAccount(existing.id(), null, null, true, "withdrawn"));
            }
        }
    }

    private final UserAccountPort accountPort;
    private final Random random;
    private final String jwtSecret;
    private final long ttlSeconds;

    @Autowired
    public UserAccountService(
        UserAccountPort accountPort,
        @Value("${stonewish.jwt.secret:" + DEFAULT_JWT_SECRET + "}") String jwtSecret,
        @Value("${stonewish.jwt.ttl-seconds:604800}") long ttlSeconds
    ) {
        this(accountPort, new Random(), jwtSecret, ttlSeconds);
    }

    public UserAccountService(UserAccountPort accountPort) {
        this(accountPort, new Random(), DEFAULT_JWT_SECRET, DEFAULT_TTL_SECONDS);
    }

    public UserAccountService(UserAccountPort accountPort, Random random) {
        this(accountPort, random, DEFAULT_JWT_SECRET, DEFAULT_TTL_SECONDS);
    }

    public UserAccountService(
        UserAccountPort accountPort,
        Random random,
        String jwtSecret,
        long ttlSeconds
    ) {
        this.accountPort = accountPort;
        this.random = random;
        this.jwtSecret = (jwtSecret != null && !jwtSecret.isBlank()) ? jwtSecret : DEFAULT_JWT_SECRET;
        this.ttlSeconds = ttlSeconds > 0 ? ttlSeconds : DEFAULT_TTL_SECONDS;
    }

    /**
     * API-17 (M-06 & N-05): 소셜(Apple/Kakao/Google) 및 게스트 로그인 (POST /api/v1/auth/login)
     * HMAC-SHA256 서명된 JWT와 유저 프로필을 반환한다.
     */
    public AuthTokenResult login(String provider) {
        String normalizedProvider = (provider == null || provider.isBlank())
            ? "guest"
            : provider.trim().toLowerCase(Locale.ROOT);
        if (!VALID_PROVIDERS.contains(normalizedProvider)) {
            throw new IllegalArgumentException("INVALID_AUTH_PROVIDER");
        }

        boolean isGuest = "guest".equals(normalizedProvider);
        String userId = UUID.randomUUID().toString();
        UserAccount created = new UserAccount(
            userId,
            null,
            null,
            isGuest,
            isGuest ? null : normalizedProvider
        );
        UserAccount saved = accountPort.save(created);
        return new AuthTokenResult(issueSignedToken(saved), saved);
    }

    /**
     * API-02 (M-06): 내 프로필 조회 (GET /api/v1/users/me)
     */
    public UserAccount getMyProfile(String userId) {
        UserAccount existing = accountPort.findById(userId);
        if (existing == null || "withdrawn".equals(existing.linkedProvider())) {
            throw new IllegalArgumentException("USER_NOT_FOUND");
        }
        return existing;
    }

    /**
     * SCR-18: 회원 탈퇴 - 계정 익명화 및 소프트 삭제 (DELETE /api/v1/users/me)
     */
    public void withdrawAccount(String userId) {
        UserAccount existing = accountPort.findById(userId);
        if (existing == null || "withdrawn".equals(existing.linkedProvider())) {
            throw new IllegalArgumentException("USER_NOT_FOUND");
        }
        accountPort.deleteOrAnonymize(userId);
    }

    /**
     * "제미나이#real" 또는 "제미나이" 입력을 파싱하고 중복 없는 (nickname, tag)를 확정하여 저장한다.
     */
    public UserAccount updateNicknameAndTag(String userId, String rawInput) {
        UserAccount existing = accountPort.findById(userId);
        if (existing == null) {
            throw new IllegalArgumentException("USER_NOT_FOUND");
        }

        NicknameWithTag parsed = parseAndAssignTag(userId, rawInput);
        UserAccount updated = new UserAccount(
            existing.id(),
            parsed.nickname(),
            parsed.tag(),
            existing.isGuest(),
            existing.linkedProvider()
        );
        return accountPort.save(updated);
    }

    /**
     * 게스트 계정을 소셜 계정(apple/kakao/google)으로 전환(연결)한다. (userId 보존)
     */
    public UserAccount linkGuestToSocial(String userId, String provider) {
        UserAccount existing = accountPort.findById(userId);
        if (existing == null) {
            throw new IllegalArgumentException("USER_NOT_FOUND");
        }
        if (!existing.isGuest()) {
            throw new IllegalStateException("ALREADY_LINKED_ACCOUNT");
        }
        if (provider == null || "guest".equalsIgnoreCase(provider)) {
            throw new IllegalArgumentException("INVALID_SOCIAL_PROVIDER");
        }

        UserAccount linked = new UserAccount(
            existing.id(),
            existing.nickname(),
            existing.tag(),
            false,
            provider.toLowerCase(Locale.ROOT)
        );
        return accountPort.save(linked);
    }

    /**
     * API-18 (M-06 & N-05): 게스트 -> 소셜 연동 후 갱신된 `isGuest=false` HMAC-SHA256 서명 JWT와 유저 정보를 함께 반환한다.
     */
    public AuthTokenResult linkGuestToSocialWithToken(String userId, String provider) {
        UserAccount linked = linkGuestToSocial(userId, provider);
        return new AuthTokenResult(issueSignedToken(linked), linked);
    }

    public String issueSignedToken(UserAccount account) {
        return issueToken(account, jwtSecret, ttlSeconds, Instant.now());
    }

    public VerifiedJwtClaims verifyToken(String token) {
        return verifyAndParseToken(token, jwtSecret, Instant.now());
    }

    public static String issueToken(UserAccount account) {
        return issueToken(account, DEFAULT_JWT_SECRET, DEFAULT_TTL_SECONDS, Instant.now());
    }

    public static String issueToken(
        UserAccount account,
        String secret,
        long ttlSeconds,
        Instant issuedAt
    ) {
        long iat = issuedAt.getEpochSecond();
        long exp = iat + ttlSeconds;
        String headerJson = "{\"alg\":\"HS256\",\"typ\":\"JWT\"}";
        String payloadJson = String.format(
            Locale.ROOT,
            "{\"sub\":\"%s\",\"guest\":%s,\"iat\":%d,\"exp\":%d}",
            account.id(),
            account.isGuest(),
            iat,
            exp
        );

        Base64.Encoder urlEncoder = Base64.getUrlEncoder().withoutPadding();
        String encodedHeader = urlEncoder.encodeToString(headerJson.getBytes(StandardCharsets.UTF_8));
        String encodedPayload = urlEncoder.encodeToString(payloadJson.getBytes(StandardCharsets.UTF_8));
        String signingInput = encodedHeader + "." + encodedPayload;
        String signature = signHmacSha256(signingInput, secret);
        return signingInput + "." + signature;
    }

    public static VerifiedJwtClaims verifyAndParseToken(String token, String secret, Instant now) {
        if (token == null || token.isBlank()) {
            return null;
        }
        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            return null;
        }
        String signingInput = parts[0] + "." + parts[1];
        String expectedSig = signHmacSha256(signingInput, secret);
        if (!MessageDigest.isEqual(
            expectedSig.getBytes(StandardCharsets.UTF_8),
            parts[2].getBytes(StandardCharsets.UTF_8)
        )) {
            return null;
        }

        try {
            String payloadJson = new String(
                Base64.getUrlDecoder().decode(parts[1]),
                StandardCharsets.UTF_8
            );
            Matcher subMatcher = SUB_PATTERN.matcher(payloadJson);
            Matcher guestMatcher = GUEST_PATTERN.matcher(payloadJson);
            Matcher expMatcher = EXP_PATTERN.matcher(payloadJson);
            if (!subMatcher.find() || !guestMatcher.find() || !expMatcher.find()) {
                return null;
            }
            String sub = subMatcher.group(1);
            boolean isGuest = Boolean.parseBoolean(guestMatcher.group(1));
            long exp = Long.parseLong(expMatcher.group(1));
            if (sub.isBlank() || exp <= now.getEpochSecond()) {
                return null;
            }
            return new VerifiedJwtClaims(sub, isGuest, exp);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private static String signHmacSha256(String signingInput, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec keySpec = new SecretKeySpec(
                secret.getBytes(StandardCharsets.UTF_8),
                "HmacSHA256"
            );
            mac.init(keySpec);
            byte[] rawHmac = mac.doFinal(signingInput.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(rawHmac);
        } catch (Exception ex) {
            throw new IllegalStateException("JWT_SIGNING_FAILED", ex);
        }
    }

    /**
     * 그룹 돌탑 조회 시 wish-tower-service의 OpenFeign 배치 요청에 응답하여
     * userId -> "닉네임#태그" 맵을 반환한다. (N+1 호출 방지)
     */
    public Map<String, String> getBatchDisplayNames(List<String> userIds) {
        return accountPort.findByIds(userIds).stream()
            .filter(u -> u.displayName() != null)
            .collect(Collectors.toMap(
                UserAccount::id,
                UserAccount::displayName,
                (a, b) -> a
            ));
    }

    private NicknameWithTag parseAndAssignTag(String userId, String rawInput) {
        if (rawInput == null || rawInput.isBlank()) {
            throw new IllegalArgumentException("NICKNAME_INVALID");
        }

        String trimmed = rawInput.trim();
        String rawNickname;
        String customTag = null;

        int hashIdx = trimmed.indexOf('#');
        if (hashIdx != -1) {
            rawNickname = trimmed.substring(0, hashIdx).trim();
            customTag = trimmed.substring(hashIdx + 1).trim();
        } else {
            rawNickname = trimmed;
        }

        validateNickname(rawNickname);

        if (customTag != null && !customTag.isEmpty()) {
            if (!customTag.matches(TAG_PATTERN)) {
                throw new IllegalArgumentException("TAG_INVALID");
            }
            if (accountPort.existsByNicknameAndTag(rawNickname, customTag, userId)) {
                throw new IllegalStateException("NICKNAME_TAG_TAKEN");
            }
            return new NicknameWithTag(rawNickname, customTag);
        }

        // 태그 미입력 시 4자리 숫자 태그(1000~9999) 자동 생성 (최대 10회 충돌 재시도)
        for (int i = 0; i < 10; i++) {
            String candidateTag = String.format("%04d", 1000 + random.nextInt(9000));
            if (!accountPort.existsByNicknameAndTag(rawNickname, candidateTag, userId)) {
                return new NicknameWithTag(rawNickname, candidateTag);
            }
        }
        throw new IllegalStateException("TAG_GENERATION_EXHAUSTED");
    }

    private void validateNickname(String nickname) {
        if (nickname.length() < 2 || nickname.length() > 12) {
            throw new IllegalArgumentException("NICKNAME_INVALID");
        }
        String lower = nickname.toLowerCase(Locale.ROOT);
        for (String forbidden : FORBIDDEN_IMPERSONATION_WORDS) {
            if (lower.contains(forbidden)) {
                throw new IllegalArgumentException("NICKNAME_FORBIDDEN");
            }
        }
    }
}
