package com.stonewish.userauth.adapter;

import com.stonewish.userauth.service.UserAccountService.UserAccount;
import com.stonewish.userauth.service.UserAccountService.UserAccountPort;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Repository;

/**
 * N-07: user-auth-service 기본 스레드 안전 영속성 어댑터
 */
@Repository
public class DefaultUserAccountPersistenceAdapter implements UserAccountPort {

    private final Map<String, UserAccount> accounts = new ConcurrentHashMap<>();

    @Override
    public UserAccount findById(String userId) {
        if (userId == null) {
            return null;
        }
        return accounts.get(userId);
    }

    @Override
    public boolean existsByNicknameAndTag(String nickname, String tag, String excludeUserId) {
        return accounts.values().stream()
            .anyMatch(acc ->
                !Objects.equals(acc.id(), excludeUserId)
                    && Objects.equals(acc.nickname(), nickname)
                    && Objects.equals(acc.tag(), tag)
            );
    }

    @Override
    public UserAccount save(UserAccount account) {
        accounts.put(account.id(), account);
        return account;
    }

    @Override
    public List<UserAccount> findByIds(List<String> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return Collections.emptyList();
        }
        return userIds.stream()
            .map(accounts::get)
            .filter(Objects::nonNull)
            .toList();
    }
}
