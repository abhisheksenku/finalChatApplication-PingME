const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');
const userAuthenticate = require("../middleware/auth");
const { isAdmin } = require('../middleware/groupAuth');

// --- Group Management ---
router.get('/fetch', userAuthenticate.authenticate, groupController.getMyGroups);
router.post('/create', userAuthenticate.authenticate, groupController.createGroup);

// --- Group Messages ---
router.get("/messages/:groupId", userAuthenticate.authenticate, groupController.getGroupConversation);
router.post('/message/add-message', userAuthenticate.authenticate, groupController.sendGroupMessage);
router.put('/message/edit/:messageId', userAuthenticate.authenticate, groupController.editGroupMessage);
router.delete('/message/delete/:messageId', userAuthenticate.authenticate, groupController.deleteGroupMessage);


router.get('/:groupId/members', userAuthenticate.authenticate, groupController.getGroupMembers);


router.put('/:groupId', userAuthenticate.authenticate, isAdmin, groupController.updateGroupDetails);


router.delete('/:groupId/members/:userId', userAuthenticate.authenticate, isAdmin, groupController.removeMemberFromGroup);

router.put('/:groupId/members/:userId', userAuthenticate.authenticate, isAdmin, groupController.updateMemberRole);
router.get('/:groupId/addable-friends', userAuthenticate.authenticate, isAdmin, groupController.getAddableFriends);

router.delete('/:groupId/leave', userAuthenticate.authenticate, groupController.leaveGroup);

router.delete('/:groupId', userAuthenticate.authenticate, isAdmin, groupController.deleteGroup);



router.post('/:groupId/members', userAuthenticate.authenticate, isAdmin, groupController.addMembersToGroup);



router.post('/message/react/:messageId', userAuthenticate.authenticate, groupController.reactToGroupMessage);


router.delete('/message/react/:messageId', userAuthenticate.authenticate, groupController.removeGroupMessageReaction);
router.get('/:groupId/membership/me', userAuthenticate.authenticate, groupController.getMembershipStatus);
router.post(
  "/mark-read",
  userAuthenticate.authenticate,
  groupController.markGroupAsRead
);

module.exports = router;