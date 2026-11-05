package com.stonewish.group.adapter;

import com.stonewish.group.entity.GroupEntity;
import com.stonewish.group.entity.GroupMemberEntity;
import com.stonewish.group.repository.GroupJpaRepository;
import com.stonewish.group.repository.GroupMemberJpaRepository;
import com.stonewish.group.service.GroupCommandService.GroupPersistencePort;
import com.stonewish.group.service.GroupCommandService.GroupRecord;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * Sprint 5: group-service Spring Data JPA 기반 영속성 어댑터 (groups / group_members 테이블 연동)
 */
@Repository
@Transactional
public class DefaultGroupPersistenceAdapter implements GroupPersistencePort {

    private final GroupJpaRepository groupRepository;
    private final GroupMemberJpaRepository memberRepository;

    @Autowired
    public DefaultGroupPersistenceAdapter(
        GroupJpaRepository groupRepository,
        GroupMemberJpaRepository memberRepository
    ) {
        this.groupRepository = groupRepository;
        this.memberRepository = memberRepository;
    }

    @Override
    public GroupRecord saveGroup(GroupRecord group) {
        Optional<GroupEntity> existing = groupRepository.findById(group.id());
        Instant createdAt = existing.map(GroupEntity::getCreatedAt).orElse(Instant.now());
        GroupEntity saved = groupRepository.save(GroupEntity.fromRecord(group, createdAt));
        return saved.toRecord();
    }

    @Override
    @Transactional(readOnly = true)
    public GroupRecord findById(String groupId) {
        if (groupId == null) {
            return null;
        }
        return groupRepository.findById(groupId)
            .map(GroupEntity::toRecord)
            .orElse(null);
    }

    @Override
    @Transactional(readOnly = true)
    public GroupRecord findByInviteCode(String inviteCode) {
        if (inviteCode == null) {
            return null;
        }
        return groupRepository.findByInviteCode(inviteCode)
            .map(GroupEntity::toRecord)
            .orElse(null);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean isMember(String groupId, String userId) {
        return memberRepository.existsByGroupIdAndUserId(groupId, userId);
    }

    @Override
    public void addMember(String groupId, String userId, String role) {
        memberRepository.save(new GroupMemberEntity(groupId, userId, role, Instant.now()));
    }

    @Override
    @Transactional(readOnly = true)
    public List<GroupRecord> findGroupsByUserId(String userId) {
        if (userId == null) {
            return Collections.emptyList();
        }
        List<String> groupIds = memberRepository.findByUserId(userId).stream()
            .map(GroupMemberEntity::getGroupId)
            .toList();
        if (groupIds.isEmpty()) {
            return Collections.emptyList();
        }
        return groupRepository.findAllById(groupIds).stream()
            .map(GroupEntity::toRecord)
            .toList();
    }

    @Override
    public void removeMember(String groupId, String userId) {
        memberRepository.deleteByGroupIdAndUserId(groupId, userId);
    }
}
