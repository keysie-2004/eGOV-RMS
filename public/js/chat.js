document.addEventListener('DOMContentLoaded', function() {
  // DOM elements
  const messageForm = document.getElementById('messageForm');
  const messageInput = document.getElementById('messageInput');
  const chatMessages = document.getElementById('chatMessages');
  
  // Current user ID from the template
  const currentUserId = parseInt(document.body.dataset.userId);

  // Load initial messages
  loadMessages();

  // Form submission handler
  messageForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const message = messageInput.value.trim();
    
    if (message) {
      sendMessage(message);
      messageInput.value = '';
    }
  });

  // Function to load messages
  function loadMessages() {
    fetch('/chat/history')
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          displayMessages(data.history);
        } else {
          showError('Failed to load messages');
        }
      })
      .catch(error => {
        console.error('Error:', error);
        showError('Failed to load messages');
      });
  }

  // Function to display messages
  function displayMessages(messages) {
    chatMessages.innerHTML = '';
    
    if (messages.length === 0) {
      chatMessages.innerHTML = `
        <div class="text-center py-10 text-gray-500">
          <i class="fas fa-comments text-4xl mb-3"></i>
          <p>No messages yet. Start the conversation!</p>
        </div>
      `;
      return;
    }
    
    messages.forEach(msg => {
      const messageElement = createMessageElement(msg);
      chatMessages.appendChild(messageElement);
    });
    
    // Scroll to bottom
    scrollToBottom();
  }

  // Function to create message element
  function createMessageElement(msg) {
    const isCurrentUser = msg.sender_id === currentUserId;
    const messageClass = isCurrentUser ? 'message-out' : 'message-in';
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `mb-4 ${messageClass} p-3`;
    
    if (!isCurrentUser) {
      messageDiv.innerHTML = `
        <div class="flex items-start space-x-3">
          <img src="${msg.profile_image || '/images/default-user.png'}" 
               class="w-8 h-8 rounded-full object-cover">
          <div>
            <div class="font-medium text-sm text-gray-700">${msg.employee_name}</div>
            <div class="text-gray-800">${msg.message}</div>
            <div class="text-xs text-gray-500 mt-1">${msg.formattedTime}</div>
          </div>
        </div>
      `;
    } else {
      messageDiv.innerHTML = `
        <div class="flex justify-end">
          <div class="text-right">
            <div class="text-white">${msg.message}</div>
            <div class="text-xs text-blue-100 mt-1">${msg.formattedTime}</div>
          </div>
        </div>
      `;
    }
    
    return messageDiv;
  }

  // Function to send message
  function sendMessage(message) {
    fetch('/chat/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatType: 'general',
        message: message
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        // Reload messages after sending
        loadMessages();
      } else {
        showError('Failed to send message');
      }
    })
    .catch(error => {
      console.error('Error:', error);
      showError('Failed to send message');
    });
  }

  // Helper function to scroll to bottom
  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Helper function to show error message
  function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }
});