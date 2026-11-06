package com.wishstone.group.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

/**
 * Sprint 5: group_db.group_members 테이블 매핑 JPA 엔티티 (복합 PK: group_id, user_id)
 * 근거: backend/sql/init-databases.sql 4장
 */
@Entity
@Table(
    name = "group_members",
    indexes = {
        @Index(name = "idx_group_members_user", columnList = "user_id")
    }
)
@IdClass(GroupMemberEntity.GroupMemberId.class)
public class GroupMemberEntity {

    public static class GroupMemberId implements Serializable {
        private String groupId;
        private String userId;

        public GroupMemberId() {
        }

        public GroupMemberId(String groupId, String userId) {
            this.groupId = groupId;
            this.userId = userId;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof GroupMemberId that)) return false;
            return Objects.equals(groupId, that.groupId) && Objects.equals(userId, that.userId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(groupId, userId);
        }
    }

    @Id
    @Column(name = "group_id", length = 36, nullable = false)
    private String groupId;

    @Id
    @Column(name = "user_id", length = 36, nullable = false)
    private String userId;

    @Column(name = "role", length = 20, nullable = false)
    private String role;

    @Column(name = "joined_at", nullable = false, updatable = false)
    private Instant joinedAt;

    protected GroupMemberEntity() {
    }

    public GroupMemberEntity(String groupId, String userId, String role, Instant joinedAt) {
        this.groupId = groupId;
        this.userId = userId;
        this.role = role != null ? role : "MEMBER";
        this.joinedAt = joinedAt != null ? joinedAt : Instant.now();
    }

    public String getGroupId() {
        return groupId;
    }

    public String getUserId() {
        return userId;
    }

    public String getRole() {
        return role;
    }

    public Instant getJoinedAt() {
        return joinedAt;
    }
}
