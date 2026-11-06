package com.wishstone.userauth.repository;

import com.wishstone.userauth.entity.UserAccountEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserAccountJpaRepository extends JpaRepository<UserAccountEntity, String> {

    boolean existsByNicknameAndTagAndIdNot(String nickname, String tag, String excludeUserId);
}
