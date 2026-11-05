package com.stonewish.userauth.repository;

import com.stonewish.userauth.entity.UserAccountEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserAccountJpaRepository extends JpaRepository<UserAccountEntity, String> {

    boolean existsByNicknameAndTagAndIdNot(String nickname, String tag, String excludeUserId);
}
