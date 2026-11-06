package com.wishstone.group.repository;

import com.wishstone.group.entity.GroupEntity;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GroupJpaRepository extends JpaRepository<GroupEntity, String> {

    Optional<GroupEntity> findByInviteCode(String inviteCode);
}
