package com.stonewish.group.adapter;

import com.stonewish.group.service.GroupCommandService.GroupPersistencePort;
import com.stonewish.group.service.GroupCommandService.GroupRecord;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Repository;

/**
 * N-07: group-service 기본 스레드 안전 영속성 어댑터
 */
@Repository
public class DefaultGroupPersistenceAdapter implements GroupPersistencePort {

    private final Map<String, GroupRecord> groups = new ConcurrentHashMap<>();
    private final Set<String> memberships = ConcurrentHashMap.newKeySet();

    @Override
    public GroupRecord saveGroup(GroupRecord group) {
        groups.put(group.id(), group);
        return group;
    }

    @Override
    public GroupRecord findById(String groupId) {
        return groupId != null ? groups.get(groupId) : null;
    }

    @Override
    public GroupRecord findByInviteCode(String inviteCode) {
        if (inviteCode == null) {
            return null;
        }
        return groups.values().stream()
            .filter(g -> inviteCode.equals(g.inviteCode()))
            .findFirst()
            .orElse(null);
    }

    @Override
    public boolean isMember(String groupId, String userId) {
        return memberships.contains(groupId + ":" + userId);
    }

    @Override
    public void addMember(String groupId, String userId, String role) {
        memberships.add(groupId + ":" + userId);
    }

    @Override
    public List<GroupRecord> findGroupsByUserId(String userId) {
        return groups.values().stream()
            .filter(g -> isMember(g.id(), userId))
            .toList();
    }

    @Override
    public void removeMember(String groupId, String userId) {
        memberships.remove(groupId + ":" + userId);
    }
}
