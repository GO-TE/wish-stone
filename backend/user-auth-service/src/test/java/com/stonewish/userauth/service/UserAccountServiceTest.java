package com.stonewish.userauth.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.stonewish.userauth.service.UserAccountService.UserAccount;
import com.stonewish.userauth.service.UserAccountService.UserAccountPort;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Random;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class UserAccountServiceTest {

    private InMemoryUserAccountAdapter accountPort;
    private UserAccountService service;

    @BeforeEach
    void setUp() {
        accountPort = new InMemoryUserAccountAdapter();
        service = new UserAccountService(accountPort, new Random(42L));

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
    @DisplayName("D-007: 게스트 계정을 소셜 계정으로 연결(link)해도 기존 userId와 닉네임#태그는 그대로 유지된다")
    void linkGuestToSocialPreservesUserIdAndNickname() {
        service.updateNicknameAndTag("user-1", "돌탑지기#real");
        UserAccount linked = service.linkGuestToSocial("user-1", "kakao");

        assertEquals("user-1", linked.id());
        assertEquals("돌탑지기#real", linked.displayName());
        assertFalse(linked.isGuest());
        assertEquals("kakao", linked.linkedProvider());
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
