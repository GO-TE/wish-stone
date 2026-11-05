package com.stonewish.group.service;

import java.security.SecureRandom;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * [사수 멘토링 포인트 - group-service (:8084) 지인 그룹 생성·참여 및 설정 분리 (D-007, DB-005)]
 * 1) 게스트 제한(D-007): 게스트 계정은 그룹을 만들거나 참여할 수 없으며 소셜 연동(link)을 먼저 해야 합니다.
 * 2) 최대 인원 설정 외부화(DB-005): 기본 50명을 코드에 박지 않고 `@Value("${stonewish.group.default-max-members:50}")`로
 *    주입받아 추후 운영 정책 변경 시 설정 파일만 고쳐서 대응합니다.
 */
@Service
public class GroupCommandService {

    private static final String INVITE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    public record GroupRecord(
        String id,
        String name,
        String inviteCode,
        String ownerId,
        int maxMembers,
        int memberCount,
        int stoneCount
    ) {}

    public interface GroupPersistencePort {
        GroupRecord saveGroup(GroupRecord group);
        GroupRecord findByInviteCode(String inviteCode);
        boolean isMember(String groupId, String userId);
        void addMember(String groupId, String userId, String role);
    }

    private final GroupPersistencePort persistencePort;
    private final int defaultMaxMembers;
    private final SecureRandom random = new SecureRandom();

    public GroupCommandService(
        GroupPersistencePort persistencePort,
        @Value("${stonewish.group.default-max-members:50}") int defaultMaxMembers
    ) {
        this.persistencePort = persistencePort;
        this.defaultMaxMembers = defaultMaxMembers;
    }

    public GroupRecord createGroup(String userId, boolean isGuest, String rawName) {
        if (isGuest) {
            throw new IllegalStateException("GUEST_GROUP_FORBIDDEN");
        }
        if (rawName == null || rawName.trim().length() < 2 || rawName.trim().length() > 20) {
            throw new IllegalArgumentException("GROUP_NAME_INVALID");
        }

        String groupId = UUID.randomUUID().toString();
        String inviteCode = generateInviteCode(8);
        GroupRecord created = new GroupRecord(
            groupId,
            rawName.trim(),
            inviteCode,
            userId,
            defaultMaxMembers,
            1,
            0
        );
        persistencePort.saveGroup(created);
        persistencePort.addMember(groupId, userId, "OWNER");
        return created;
    }

    public GroupRecord joinGroup(String userId, boolean isGuest, String inviteCode) {
        if (isGuest) {
            throw new IllegalStateException("GUEST_GROUP_FORBIDDEN");
        }
        GroupRecord group = persistencePort.findByInviteCode(inviteCode);
        if (group == null) {
            throw new IllegalArgumentException("INVITE_INVALID");
        }
        if (persistencePort.isMember(group.id(), userId)) {
            throw new IllegalStateException("ALREADY_MEMBER");
        }
        if (group.memberCount() >= group.maxMembers()) {
            throw new IllegalStateException("GROUP_FULL");
        }

        GroupRecord updated = new GroupRecord(
            group.id(),
            group.name(),
            group.inviteCode(),
            group.ownerId(),
            group.maxMembers(),
            group.memberCount() + 1,
            group.stoneCount()
        );
        persistencePort.saveGroup(updated);
        persistencePort.addMember(group.id(), userId, "MEMBER");
        return updated;
    }

    private String generateInviteCode(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(INVITE_CHARS.charAt(random.nextInt(INVITE_CHARS.length())));
        }
        return sb.toString();
    }
}
