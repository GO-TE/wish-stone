package com.wishstone.interaction.repository;

import com.wishstone.interaction.entity.CheerEntity;
import com.wishstone.interaction.entity.CheerEntity.CheerId;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CheerJpaRepository extends JpaRepository<CheerEntity, CheerId> {

    boolean existsByWishIdAndUserId(String wishId, String userId);

    long countByWishId(String wishId);
}
