import { memo, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import type { Comment } from '../api/client';

interface CommentsPanelProps {
  projectId: string;
  entityType: 'zone' | 'conduit' | 'asset';
  entityId: string;
}

const CommentsPanel = memo(({ projectId, entityType, entityId }: CommentsPanelProps) => {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New comment form
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // Show resolved
  const [showResolved, setShowResolved] = useState(false);

  // Load comments
  useEffect(() => {
    const loadComments = async () => {
      if (!projectId) return;

      try {
        setLoading(true);
        const data = await api.listComments(projectId, { entity_type: entityType, entity_id: entityId, include_resolved: true });
        setComments(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load comments');
      } finally {
        setLoading(false);
      }
    };

    loadComments();
  }, [projectId, entityType, entityId]);

  // Add comment
  const handleAddComment = useCallback(async () => {
    if (!newComment.trim() || !projectId) return;

    try {
      setSubmitting(true);
      setError(null);

      const comment = await api.createComment(projectId, {
        entity_type: entityType,
        entity_id: entityId,
        text: newComment.trim(),
      });

      setComments((prev) => [comment, ...prev]);
      setNewComment('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  }, [projectId, entityType, entityId, newComment]);

  // Delete comment
  const handleDelete = useCallback(
    async (commentId: string) => {
      if (!confirm('Are you sure you want to delete this comment?')) return;

      try {
        await api.deleteComment(projectId, commentId);
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete comment');
      }
    },
    [projectId]
  );

  // Edit comment
  const handleEdit = useCallback(
    async (commentId: string) => {
      if (!editText.trim()) return;

      try {
        const updated = await api.updateComment(projectId, commentId, editText.trim());

        setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
        setEditingId(null);
        setEditText('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update comment');
      }
    },
    [projectId, editText]
  );

  // Resolve/unresolve
  const handleToggleResolve = useCallback(
    async (commentId: string, isResolved: boolean) => {
      try {
        const updated = isResolved
          ? await api.unresolveComment(projectId, commentId)
          : await api.resolveComment(projectId, commentId);

        setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update comment');
      }
    },
    [projectId]
  );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const filteredComments = showResolved ? comments : comments.filter((c) => !c.is_resolved);
  const unresolvedCount = comments.filter((c) => !c.is_resolved).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Comments ({unresolvedCount})
        </h4>
        {comments.some((c) => c.is_resolved) && (
          <button
            onClick={() => setShowResolved(!showResolved)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            {showResolved ? 'Hide resolved' : 'Show resolved'}
          </button>
        )}
      </div>

      {error && (
        <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-xs">
          {error}
        </div>
      )}

      {/* New comment form */}
      <div className="space-y-2">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          rows={2}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 resize-none"
        />
        <div className="flex justify-end">
          <button
            onClick={handleAddComment}
            disabled={submitting || !newComment.trim()}
            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded"
          >
            {submitting ? 'Adding...' : 'Add Comment'}
          </button>
        </div>
      </div>

      {/* Comments list */}
      {loading ? (
        <div className="text-center py-4 text-gray-500 text-sm">Loading...</div>
      ) : filteredComments.length === 0 ? (
        <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-xs">
          No comments yet
        </div>
      ) : (
        <div className="space-y-2">
          {filteredComments.map((comment) => (
            <div
              key={comment.id}
              className={`p-2 rounded text-xs ${
                comment.is_resolved
                  ? 'bg-gray-100 dark:bg-gray-700/50 opacity-60'
                  : 'bg-gray-50 dark:bg-gray-700'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800 dark:text-gray-100">
                      {comment.author_display_name || comment.author_username || 'Unknown'}
                    </span>
                    <span className="text-gray-400 dark:text-gray-500">
                      {formatDate(comment.created_at)}
                    </span>
                    {comment.is_resolved && (
                      <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded text-[10px]">
                        Resolved
                      </span>
                    )}
                  </div>

                  {editingId === comment.id ? (
                    <div className="mt-1 space-y-1">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={2}
                        className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-600"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(comment.id)}
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditText('');
                          }}
                          className="text-gray-500 hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                      {comment.text}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleToggleResolve(comment.id, comment.is_resolved)}
                    className="p-1 text-gray-400 hover:text-green-600 dark:hover:text-green-400"
                    title={comment.is_resolved ? 'Unresolve' : 'Resolve'}
                  >
                    {comment.is_resolved ? '↩' : '✓'}
                  </button>
                  {user?.id === comment.author_id && editingId !== comment.id && (
                    <>
                      <button
                        onClick={() => {
                          setEditingId(comment.id);
                          setEditText(comment.text);
                        }}
                        className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                        title="Edit"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => handleDelete(comment.id)}
                        className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                        title="Delete"
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

CommentsPanel.displayName = 'CommentsPanel';

export default CommentsPanel;
