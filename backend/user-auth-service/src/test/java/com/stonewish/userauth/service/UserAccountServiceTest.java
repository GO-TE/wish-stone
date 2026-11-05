package com.stonewish.userauth.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.stonewish.userauth.controller.UserAuthController;
import com.stonewish.userauth.controller.UserAuthController.ErrorResponse;
import com.stonewish.userauth.controller.UserAuthController.LinkSocialRequest;
import com.stonewish.userauth.controller.UserAuthController.LoginRequest;
import com.stonewish.userauth.controller.UserAuthController.UserAuthExceptionHandler;
import com.stonewish.userauth.service.UserAccountService.AuthTokenResult;
import com.stonewish.userauth.service.UserAccountService.UserAccount;
import com.stonewish.userauth.service.UserAccountService.UserAccountPort;
import com.stonewish.userauth.service.UserAccountService.VerifiedJwtClaims;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingRequestHeaderException;

class UserAccountServiceTest {

    private InMemoryUserAccountAdapter accountPort;
    private UserAccountService service;
    private UserAuthController controller;

    @BeforeEach
    void setUp() {
        accountPort = new InMemoryUserAccountAdapter();
        service = new UserAccountService(accountPort, new Random(42L));
        controller = new UserAuthController(service);

        accountPort.save(new UserAccount("user-1", null, null, true, null));
        accountPort.save(new UserAccount("user-2", null, null, false, "kakao"));
    }

    @Test
    @DisplayName("D-015: 사용자가 직접 태그(제미나이#real)를 지정하면 그대로 저장되고, 같은 닉네임이라도 다른 태그(제미나이#dev)는 허용된다")
    void customTagAndSameNicknameDifferentTagAllowed() {
        UserAccount u1 = service.updateNicknameAndTag("user-1", "제미나이#real");
        assertEquals("제미나이", u1.nickname());
        assertEquals("real", u1.tag());
        assertEquals("제미나이#real", u1.displayName());

        UserAccount u2 = service.updateNicknameAndTag("user-2", "제미나이#dev");
        assertEquals("제미나이#dev", u2.displayName());

        // 동일한 (제미나이, real) 조합을 타인이 쓰려고 하면 NICKNAME_TAG_TAKEN 예외 발생
        assertThrows(
            IllegalStateException.class,
            () -> service.updateNicknameAndTag("user-2", "제미나이#real")
        );
    }

    @Test
    @DisplayName("D-015: 태그를 생략하고 닉네임만 입력하면 서버가 4자리 숫자 태그를 자동 부여한다")
    void autoGenerateFourDigitTagWhenOmitted() {
        UserAccount u1 = service.updateNicknameAndTag("user-1", "소원돌탑");
        assertEquals("소원돌탑", u1.nickname());
        assertTrue(u1.tag().matches("^\\d{4}$"));
    }

    @Test
    @DisplayName("D-007 & M-06 & N-05 & N-09: 게스트->소셜 연결 시 userId 보존, HMAC-SHA256 서명 JWT 발급 및 변조/만료 토큰 거부 검증")
    void linkGuestToSocialPreservesUserIdAndIssuesSignedJwt() throws Exception {
        service.updateNicknameAndTag("user-1", "돌탑지기#real");
        AuthTokenResult linkedResult = controller.linkSocial("user-1", new LinkSocialRequest("kakao"));

        assertNotNull(linkedResult.accessToken());
        assertEquals(3, linkedResult.accessToken().split("\\.").length);

        VerifiedJwtClaims verified = service.verifyToken(linkedResult.accessToken());
        assertNotNull(verified);
        assertEquals("user-1", verified.userId());
        assertFalse(verified.isGuest());

        // 서명 변조 시 검증 실패(null)
        String tamperedToken = linkedResult.accessToken() + "tampered";
        assertNull(service.verifyToken(tamperedToken));

        // 만료된 토큰 검증 실패(null)
        String expiredToken = UserAccountService.issueToken(
            linkedResult.user(),
            UserAccountService.DEFAULT_JWT_SECRET,
            -10L,
            Instant.now()
        );
        assertNull(service.verifyToken(expiredToken));

        // N-09: JSON 직렬화 시 isGuest, tag, nickname, accessToken 키 검증
        ObjectMapper mapper = new ObjectMapper();
        JsonNode json = mapper.readTree(mapper.writeValueAsString(linkedResult));
        assertTrue(json.has("accessToken"));
        assertTrue(json.get("user").has("isGuest"));
        assertFalse(json.get("user").get("isGuest").asBoolean());
        assertEquals("real", json.get("user").get("tag").asText());
    }

    @Test
    @DisplayName("M-06 & SCR-18 & N-04 & N-05: 게스트/소셜 로그인 서명 JWT 검증, 내 프로필 조회, 회원 탈퇴, X-User-Id 누락 401 검증")
    void loginGetMeAndWithdrawAccount() throws Exception {
        AuthTokenResult loginRes = controller.login(new LoginRequest("guest"));
        String uid = loginRes.user().id();
        assertTrue(loginRes.user().isGuest());

        VerifiedJwtClaims claims = service.verifyToken(loginRes.accessToken());
        assertNotNull(claims);
        assertEquals(uid, claims.userId());
        assertTrue(claims.isGuest());

        UserAccount me = controller.getMe(uid);
        assertEquals(uid, me.id());

        // SCR-18 회원 탈퇴 후 재조회 시 USER_NOT_FOUND 예외 발생
        controller.withdrawAccount(uid);
        assertThrows(
            IllegalArgumentException.class,
            () -> controller.getMe(uid)
        );

        // N-04: X-User-Id 헤더 누락 시 401 UNAUTHORIZED 응답 검증
        UserAuthExceptionHandler advice = new UserAuthExceptionHandler();
        MethodParameter param = new MethodParameter(
            UserAuthController.class.getMethod("getMe", String.class), 0
        );
        ResponseEntity<ErrorResponse> unauthResp = advice.handleMissingHeader(
            new MissingRequestHeaderException("X-User-Id", param)
        );
        assertEquals(HttpStatus.UNAUTHORIZED, unauthResp.getStatusCode());
        assertEquals("UNAUTHORIZED", unauthResp.getBody().code());
    }

    @Test
    @DisplayName("사칭 금지어(관리자, stonewish 등)가 포함된 닉네임은 차단된다")
    void blockForbiddenImpersonationNickname() {
        assertThrows(
            IllegalArgumentException.class,
            () -> service.updateNicknameAndTag("user-1", "공식운영자#real")
        );
        assertThrows(
            IllegalArgumentException.class,
            () -> service.updateNicknameAndTag("user-1", "StoneWish#0001")
        );
    }

    static class InMemoryUserAccountAdapter implements UserAccountPort {
        private final Map<String, UserAccount> store = new HashMap<>();

        @Override
        public UserAccount findById(String userId) {
            return store.get(userId);
        }

        @Override
        public boolean existsByNicknameAndTag(String nickname, String tag, String excludeUserId) {
            return store.values().stream()
                .anyMatch(u ->
                    !Objects.equals(u.id(), excludeUserId)
                        && Objects.equals(u.nickname(), nickname)
                        && Objects.equals(u.tag(), tag)
                );
        }

        @Override
        public UserAccount save(UserAccount account) {
            store.put(account.id(), account);
            return account;
        }

        @Override
        public List<UserAccount> findByIds(List<String> userIds) {
            return userIds.stream()
                .map(store::get)
                .filter(Objects::nonNull)
                .toList();
        }
    }
}
