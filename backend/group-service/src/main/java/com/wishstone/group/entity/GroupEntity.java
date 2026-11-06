package com.wishstone.group.entity;

import com.wishstone.group.service.GroupCommandService.GroupRecord;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Sprint 5: group_db.groups 테이블 매핑 JPA 엔티티
 * 근거: backend/sql/init-databases.sql 4장
 */
@Entity
@Table(name = "groups")
public class GroupEntity {

    @Id
    @Column(name = "id", length = 36, nullable = false)
    private String id;

    @Column(name = "name", length = 20, nullable = false)
    private String name;

    @Column(name = "invite_code", length = 12, nullable = false, unique = true)
    private String inviteCode;

    @Column(name = "owner_id", length = 36, nullable = false)
    private String ownerId;

    @Column(name = "max_members", nullable = false)
    private int maxMembers;

    @Column(name = "member_count", nullable = false)
    private int memberCount;

    @Column(name = "stone_count", nullable = false)
    private int stoneCount;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected GroupEntity() {
    }

    public GroupEntity(
        String id,
        String name,
        String inviteCode,
        String ownerId,
        int maxMembers,
        int memberCount,
        int stoneCount,
        Instant createdAt
    ) {
        this.id = id;
        this.name = name;
        this.inviteCode = inviteCode;
        this.ownerId = ownerId;
        this.maxMembers = maxMembers;
        this.memberCount = memberCount;
        this.stoneCount = stoneCount;
        this.createdAt = createdAt != null ? createdAt : Instant.now();
    }

    public static GroupEntity fromRecord(GroupRecord record, Instant existingCreatedAt) {
        return new GroupEntity(
            record.id(),
            record.name(),
            record.inviteCode(),
            record.ownerId(),
            record.maxMembers(),
            record.memberCount(),
            record.stoneCount(),
            existingCreatedAt != null ? existingCreatedAt : Instant.now()
        );
    }

    public GroupRecord toRecord() {
        return new GroupRecord(
            id,
            name,
            inviteCode,
            ownerId,
            maxMembers,
            memberCount,
            stoneCount
        );
    }

    public String getId() {
        return id;
    }

    public String getInviteCode() {
        return inviteCode;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
