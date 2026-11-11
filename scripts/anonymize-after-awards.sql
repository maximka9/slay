-- Run only after a verified D1 backup and final result publication.
-- Final aggregate snapshots remain in results_snapshots/result_entries.
DELETE FROM sessions;
DELETE FROM oauth_states;
DELETE FROM rate_limits;
UPDATE moderation_actions
SET target_user_id = NULL, target_vote_id = NULL, reason = NULL, comment = NULL;
DELETE FROM votes;
DELETE FROM users;
