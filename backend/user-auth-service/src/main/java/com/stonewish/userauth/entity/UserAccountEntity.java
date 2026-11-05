package com.stonewish.userauth.entity;

import com.stonewish.userauth.service.UserAccountService.UserAccount;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

/**
 * Sprint 5: user_db.users 테이블 매핑 JPA 엔티티 (uk_nickname_tag 복합 유니크 인덱스)
 * 근거: backend/sql/init-databases.sql 1장
 */
@Entity
@Table(
    name = "users",
    uniqueConstraints = {
        @UniqueConstraint(name = "uk_nickname_tag", columnNames = {"nickname", "tag"})
    }
)
public class UserAccountEntity {

    @Id
    @Column(name = "id", length = 36, nullable = false)
    private String id;

    @Column(name = "nickname", length = 12)
    private String nickname;

    @Column(name = "tag", length = 10)
    private String tag;

    @Column(name = "is_guest", nullable = false)
    private boolean isGuest;

    @Column(name = "linked_provider", length = 20)
    private String linkedProvider;

    @Column(name = "last_checked_at", nullable = false)
    private Instant lastCheckedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    protected UserAccountEntity() {
    }

    public UserAccountEntity(
        String id,
        String nickname,
        String tag,
        boolean isGuest,
        String linkedProvider,
        Instant lastCheckedAt,
        Instant createdAt,
        Instant deletedAt
    ) {
        this.id = id;
        this.nickname = nickname;
        this.tag = tag;
        this.isGuest = isGuest;
        this.linkedProvider = linkedProvider;
        this.lastCheckedAt = lastCheckedAt != null ? lastCheckedAt : Instant.now();
        this.createdAt = createdAt != null ? createdAt : Instant.now();
        this.deletedAt = deletedAt;
    }

    public static UserAccountEntity fromDomain(UserAccount domain, Instant existingCreatedAt) {
        Instant now = Instant.now();
        Instant deleted = "withdrawn".equals(domain.linkedProvider()) ? now : null;
        return new UserAccountEntity(
            domain.id(),
            domain.nickname(),
            domain.tag(),
            domain.isGuest(),
            domain.linkedProvider(),
            now,
            existingCreatedAt != null ? existingCreatedAt : now,
            deleted
        );
    }

    public UserAccount toDomain() {
        return new UserAccount(id, nickname, tag, isGuest, linkedProvider);
    }

    public String getId() {
        return id;
    }

    public String getNickname() {
        return nickname;
    }

    public String getTag() {
        return tag;
    }

    public boolean isGuest() {
        return isGuest;
    }

    public String getLinkedProvider() {
        return linkedProvider;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getDeletedAt() {
        return deletedAt;
    }
}
