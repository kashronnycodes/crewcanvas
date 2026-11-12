# Task pages and member navigation

The current navigation is documented in [member-navigation.md](member-navigation.md). This supersedes the earlier avatar task-card interface and peer task summaries.

Task pages retain one scrolling body with Task details, Files and previews, Revisions, Payments and Activity in that order. The task picker switches authorized tasks. Files, stored revisions and reference images, approval confirmation, payment actions and activity history are preserved.

Member clicks show only a compact name/project-role dialog. Regular members find their assigned work in My Tasks. Owners create, assign, edit and monitor work in Project Studio. Project Whiteboard retains stored annotations, drawing, pan, zoom, fullscreen and file objects without task-management buttons. Existing board objects and task relationships are not rewritten.

The former roster/summaries API now requires an authenticated employer membership. Regular-member requests are denied before roster data is read. Full snapshots, private storage and project commands continue enforcing their existing assignment/membership checks and database RLS.

Verification screenshots remain local under ignored docs/evidence because live views can contain private task files and account context.
