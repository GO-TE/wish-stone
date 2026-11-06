package com.wishstone.userauth.adapter;

import com.wishstone.userauth.entity.UserAccountEntity;
import com.wishstone.userauth.repository.UserAccountJpaRepository;
import com.wishstone.userauth.service.UserAccountService.UserAccount;
import com.wishstone.userauth.service.UserAccountService.UserAccountPort;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * Sprint 5: user-auth-service Spring Data JPA 기반 영속성 어댑터 (users 테이블 연동)
 */
@Repository
@Transactional
public class DefaultUserAccountPersistenceAdapter implements UserAccountPort {

    private final UserAccountJpaRepository jpaRepository;

    @Autowired
    public DefaultUserAccountPersistenceAdapter(UserAccountJpaRepository jpaRepository) {
        this.jpaRepository = jpaRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public UserAccount findById(String userId) {
        if (userId == null) {
            return null;
        }
        return jpaRepository.findById(userId)
            .map(UserAccountEntity::toDomain)
            .orElse(null);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean existsByNicknameAndTag(String nickname, String tag, String excludeUserId) {
        String safeExclude = excludeUserId != null ? excludeUserId : "";
        return jpaRepository.existsByNicknameAndTagAndIdNot(nickname, tag, safeExclude);
    }

    @Override
    public UserAccount save(UserAccount account) {
        Optional<UserAccountEntity> existing = jpaRepository.findById(account.id());
        Instant createdAt = existing.map(UserAccountEntity::getCreatedAt).orElse(Instant.now());
        UserAccountEntity saved = jpaRepository.save(UserAccountEntity.fromDomain(account, createdAt));
        return saved.toDomain();
    }

    @Override
    @Transactional(readOnly = true)
    public List<UserAccount> findByIds(List<String> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return Collections.emptyList();
        }
        return jpaRepository.findAllById(userIds).stream()
            .map(UserAccountEntity::toDomain)
            .toList();
    }
}
