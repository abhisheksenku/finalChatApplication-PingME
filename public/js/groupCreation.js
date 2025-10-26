document.addEventListener("DOMContentLoaded", () => {
  // This script assumes that 'window.chatItems' and 'window.renderChatList'
  // are defined in another script that loads before this one (e.g., chat.js).

  // ------------------ Users array ------------------
  let users = []; // This will be filled from the server
  const token = sessionStorage.getItem("token");
  if (!token) {
    alert("You must be logged in");
    window.location.href = "/login";
    return;
  }

  // ------------------ DOM Elements ------------------
  const newGroupBtn = document.getElementById("menu-new-group");
  const newGroupPanel = document.getElementById("new-group-content");
  const backBtnGroup = document.getElementById("back-button-group");
  const mobileNewGroupBtn = document.getElementById("mobile-new-group");
  const newChatMenu = document.getElementById("new-chat-menu");
  const mobileMenu = document.getElementById("mobile-menu");

  const createGroupBtn = document.querySelector("#new-group-content .create-group-btn");
  const groupNameInput = document.getElementById("group-name");
  const groupSearchInput = document.getElementById("group-search");
  const groupContactList = document.querySelector("#new-group-content .chat-list-items");

  // ------------------ Fetch Users from Server ------------------
  const fetchUsersFromServer = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/api/contacts/friends`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      users = res.data.friends; // Backend already removes the current user
      renderGroupContacts(users);
    } catch (err) {
      console.error("Error fetching users:", err.response?.data || err.message);
    }
  };

  // ------------------ Render Contacts for Selection ------------------
  const renderGroupContacts = (list) => {
    groupContactList.innerHTML = "";
    list.forEach((user) => {
      const li = document.createElement("li");
      li.className = "chat";
      li.innerHTML = `
        <img src="${user.img || `https://placehold.co/50x50/695cfe/ffffff?text=${user.name[0].toUpperCase()}`}" alt="${user.name}'s profile picture" class="chat-img" />
        <div class="chat-info">
          <h3 class="chat-name">${user.name}</h3>
        </div>
        <input type="checkbox" class="contact-checkbox" data-name="${user.name}" data-img="${user.img}" data-id="${user.id}" />
      `;
      groupContactList.appendChild(li);
    });
  };

  // Initial fetch when the page loads
  fetchUsersFromServer();

  // ------------------ Event Listeners ------------------

  // Search functionality for contacts
  groupSearchInput.addEventListener("input", () => {
    const term = groupSearchInput.value.toLowerCase();
    const filtered = users.filter((u) => u.name.toLowerCase().includes(term));
    renderGroupContacts(filtered);
  });

  // Panel Navigation
  newGroupBtn.addEventListener("click", () => {
    newChatMenu.classList.remove("active");
    if (typeof window.showPanel === "function") window.showPanel(newGroupPanel);
  });

  mobileNewGroupBtn.addEventListener("click", () => {
    mobileMenu.classList.remove("active");
    if (typeof window.showPanel === "function") window.showPanel(newGroupPanel);
  });

  backBtnGroup.addEventListener("click", () => {
    if (typeof window.showMainTabs === "function") window.showMainTabs();
  });

  // Main Group Creation Logic
  createGroupBtn.addEventListener("click", async () => {
    const groupName = groupNameInput.value.trim();
    if (!groupName) {
        window.showToast("Please enter a group name");
      return;
    }

    const selectedMemberIds = [];
    document
      .querySelectorAll("#new-group-content .contact-checkbox:checked")
      .forEach((cb) => {
        selectedMemberIds.push(cb.dataset.id);
      });

    if (selectedMemberIds.length === 0) {
      window.showToast("Please select at least one member");
      return;
    }

    try {
      const res = await axios.post(
        `${BASE_URL}/api/group/create`,
        {
          name: groupName,
          members: selectedMemberIds,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const newGroup = res.data;

      // 1. Push the new group to the global central chatItems array.
      // We add the 'type' and an empty 'messages' array to match the expected structure.
      window.chatItems.push({ ...newGroup, type: 'group', messages: [] });

      // 2. Call the global function to re-render the entire list from the updated state.
      // This ensures event listeners are correctly attached and the UI is in sync.
      window.renderChatList();

      // Reset inputs and close the panel
      groupNameInput.value = "";
      document
        .querySelectorAll("#new-group-content .contact-checkbox")
        .forEach((cb) => (cb.checked = false));

      if (typeof window.showMainTabs === "function") window.showMainTabs();

    } catch (err) {
      console.error("Error creating group:", err.response?.data || err.message);
      window.showToast("Failed to create group", true);
    }
  });
});