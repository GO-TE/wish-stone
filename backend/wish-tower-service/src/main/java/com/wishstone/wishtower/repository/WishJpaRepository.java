package com.wishstone.wishtower.repository;

import com.wishstone.wishtower.entity.WishEntity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WishJpaRepository extends JpaRepository<WishEntity, String> {

    List<WishEntity> findByGroupIdIsNull();

    List<WishEntity> findByGroupIdIsNullAndCategoryCode(String categoryCode);

    List<WishEntity> findByGroupId(String groupId);

    List<WishEntity> findByGroupIdIsNullAndStatus(String status);

    List<WishEntity> findByUserId(String userId);
}
