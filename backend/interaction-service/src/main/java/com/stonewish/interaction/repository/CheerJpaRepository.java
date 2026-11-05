package com.stonewish.interaction.repository;

import com.stonewish.interaction.entity.CheerEntity;
import com.stonewish.interaction.entity.CheerEntity.CheerId;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CheerJpaRepository extends JpaRepository<CheerEntity, CheerId> {

    boolean existsByWishIdAndUserId(String wishId, String userId);

    long countByWishId(String wishId);
}
