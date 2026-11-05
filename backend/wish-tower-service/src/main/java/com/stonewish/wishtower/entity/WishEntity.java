package com.stonewish.wishtower.entity;

import com.stonewish.wishtower.service.WishCommandService.WishRecord;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * Sprint 5: wish_db.wishes 테이블 매핑 JPA 엔티티
 * 근거: backend/sql/init-databases.sql 2장
 */
@Entity
@Table(
    name = "wishes",
    indexes = {
        @Index(name = "idx_wishes_global_tower", columnList = "group_id, status, created_at"),
        @Index(name = "idx_wishes_category_tower", columnList = "group_id, category_code, status, created_at"),
        @Index(name = "idx_wishes_user", columnList = "user_id, created_at")
    }
)
public class WishEntity {

    @Id
    @Column(name = "id", length = 36, nullable = false)
    private String id;

    @Column(name = "user_id", length = 36, nullable = false)
    private String userId;

    @Column(name = "group_id", length = 36)
    private String groupId;

    @Column(name = "category_code", length = 20, nullable = false)
    private String categoryCode;

    @Column(name = "content", length = 200, nullable = false)
    private String content;

    @Column(name = "stone_shape", length = 20, nullable = false)
    private String stoneShape;

    @Column(name = "stone_color", length = 10, nullable = false)
    private String stoneColor;

    @Column(name = "pose", columnDefinition = "TEXT", nullable = false)
    private String poseJson;

    @Column(name = "cheer_count", nullable = false)
    private int cheerCount;

    @Column(name = "status", length = 20, nullable = false)
    private String status;

    @Column(name = "bloom_type", length = 20)
    private String bloomType;

    @Column(name = "fulfilled_at")
    private Instant fulfilledAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected WishEntity() {
    }

    public WishEntity(
        String id,
        String userId,
        String groupId,
        String categoryCode,
        String content,
        String stoneShape,
        String stoneColor,
        String poseJson,
        int cheerCount,
        String status,
        String bloomType,
        Instant fulfilledAt,
        Instant createdAt
    ) {
        this.id = id;
        this.userId = userId;
        this.groupId = (groupId != null && !groupId.isBlank()) ? groupId : null;
        this.categoryCode = categoryCode;
        this.content = content;
        this.stoneShape = stoneShape;
        this.stoneColor = stoneColor;
        this.poseJson = poseJson;
        this.cheerCount = cheerCount;
        this.status = status;
        this.bloomType = bloomType;
        this.fulfilledAt = fulfilledAt;
        this.createdAt = createdAt != null ? createdAt : Instant.now();
    }

    public static WishEntity fromRecord(WishRecord record, String bloomType, Instant fulfilledAt) {
        return new WishEntity(
            record.id(),
            record.userId(),
            record.groupId(),
            record.categoryCode(),
            record.content(),
            record.stoneShape(),
            record.stoneColor(),
            record.poseJson(),
            record.cheerCount(),
            record.status(),
            bloomType,
            fulfilledAt,
            record.createdAt()
        );
    }

    public WishRecord toRecord() {
        return new WishRecord(
            id,
            userId,
            groupId,
            categoryCode,
            content,
            stoneShape,
            stoneColor,
            poseJson,
            cheerCount,
            status,
            createdAt
        );
    }

    public String getId() {
        return id;
    }

    public String getUserId() {
        return userId;
    }

    public String getGroupId() {
        return groupId;
    }

    public String getCategoryCode() {
        return categoryCode;
    }

    public int getCheerCount() {
        return cheerCount;
    }

    public String getStatus() {
        return status;
    }

    public String getBloomType() {
        return bloomType;
    }

    public Instant getFulfilledAt() {
        return fulfilledAt;
    }

    public void setBloomType(String bloomType) {
        this.bloomType = bloomType;
    }

    public void setFulfilledAt(Instant fulfilledAt) {
        this.fulfilledAt = fulfilledAt;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public void incrementCheerCount() {
        this.cheerCount++;
    }
}
