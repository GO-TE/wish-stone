package com.wishstone.group.repository;

import com.wishstone.group.entity.GroupMemberEntity;
import com.wishstone.group.entity.GroupMemberEntity.GroupMemberId;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GroupMemberJpaRepository extends JpaRepository<GroupMemberEntity, GroupMemberId> {

    boolean existsByGroupIdAndUserId(String groupId, String userId);

    List<GroupMemberEntity> findByUserId(String userId);

    void deleteByGroupIdAndUserId(String groupId, String userId);
}
