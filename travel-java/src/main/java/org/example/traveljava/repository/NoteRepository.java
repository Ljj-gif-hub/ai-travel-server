package org.example.traveljava.repository;

import org.example.traveljava.entity.Note;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface NoteRepository extends JpaRepository<Note, Long> {
    List<Note> findByUserIdOrderByCreatedAtDesc(Long userId);
    List<Note> findByUserIdAndStatusOrderByCreatedAtDesc(Long userId, String status);
    int countByUserId(Long userId);
    int countByUserIdAndStatus(Long userId, String status);

    /** 社区发现页：获取所有已发布的游记，按时间倒序 */
    List<Note> findByStatusOrderByCreatedAtDesc(String status);

    /** 社区发现页：分页获取已发布游记 */
    Page<Note> findByStatusOrderByCreatedAtDesc(String status, Pageable pageable);

    // ---- 【新功能】举报隐藏过滤：社区页只展示未被举报隐藏的游记 ----

    /** 发现页（过滤 hidden）：已发布且未被举报隐藏 */
    List<Note> findByStatusAndHiddenFalseOrderByCreatedAtDesc(String status);

    /** 发现页分页（过滤 hidden） */
    Page<Note> findByStatusAndHiddenFalseOrderByCreatedAtDesc(String status, Pageable pageable);

    /** 视频 Feed / 作者作品 / 标题搜索：可选 userId、只看视频、关键词 */
    @Query("""
        SELECT n FROM Note n WHERE n.status = :status AND n.hidden = false
        AND (:userId IS NULL OR n.userId = :userId)
        AND (:videoOnly = false OR LOWER(COALESCE(n.cover, '')) LIKE '%.mp4%'
            OR LOWER(COALESCE(n.cover, '')) LIKE '%.webm%'
            OR LOWER(COALESCE(n.cover, '')) LIKE '%.mov%'
            OR LOWER(COALESCE(n.content, '')) LIKE '%<video%')
        AND (:q = '' OR LOWER(COALESCE(n.title, '')) LIKE LOWER(CONCAT('%', :q, '%'))
            OR LOWER(COALESCE(n.content, '')) LIKE LOWER(CONCAT('%', :q, '%')))
        ORDER BY n.createdAt DESC
        """)
    Page<Note> searchPublished(@Param("status") String status,
                               @Param("userId") Long userId,
                               @Param("videoOnly") boolean videoOnly,
                               @Param("q") String q,
                               Pageable pageable);

    /** 原子自增浏览量，避免并发丢失更新 */
    @Modifying
    @Query("update Note n set n.views = n.views + 1 where n.id = :id")
    int incrementViews(@Param("id") Long id);

    /**
     * 【并发安全】原子增减点赞数（delta=+1 点赞 / -1 取消点赞）。
     * 条件 n.likes + :delta >= 0 防止取消点赞把计数减成负数；
     * clearAutomatically 清空一级缓存，保证后续 findById 读到更新后的值。
     */
    @Modifying(clearAutomatically = true)
    @Query("update Note n set n.likes = n.likes + :delta where n.id = :id and n.likes + :delta >= 0")
    int adjustLikes(@Param("id") Long id, @Param("delta") int delta);

    /**
     * 【并发安全】原子增减评论数（delta=+1 新增评论/回复 / -1 删除）。
     * 条件 n.comments + :delta >= 0 防止减成负数。
     */
    @Modifying(clearAutomatically = true)
    @Query("update Note n set n.comments = n.comments + :delta where n.id = :id and n.comments + :delta >= 0")
    int adjustComments(@Param("id") Long id, @Param("delta") int delta);

    /** 【新功能-收藏夹】按 id 集合批量查询笔记（用于收藏夹详情摘要） */
    List<Note> findByIdIn(java.util.Collection<Long> ids);
}
