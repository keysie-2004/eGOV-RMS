document.addEventListener('DOMContentLoaded', function() {
  const messageForm = document.getElementById('messageForm');
  const messageInput = document.getElementById('messageInput');
  const chatMessages = document.getElementById('chatMessages');
  const currentUserId = parseInt(document.body.dataset.userId);
  
  // Connect to Socket.io
  const socket = io();
  
  // Join general chat room
  socket.emit('joinGeneral');
  
  // Load initial messages
  loadInitialMessages();
  
  // Handle form submission
  messageForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const message = messageInput.value.trim();
    
    if (message) {
      sendMessage(message);
      messageInput.value = '';
    }
  });
  
  // Listen for new messages from server
  socket.on('newMessage', (message) => {
    addMessageToChat({
      ...message,
      isCurrentUser: message.sender_id === currentUserId
    });
  });
  
  // Load initial messages
  function loadInitialMessages() {
    fetch('/chat/history')
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          displayMessages(data.history);
        }
      })
      .catch(error => {
        console.error('Error loading messages:', error);
      });
  }
  
  // Display all messages
  function displayMessages(messages) {
    chatMessages.innerHTML = '';
    
    if (messages.length === 0) {
      showNoMessages();
      return;
    }
    
    messages.forEach(msg => {
      addMessageToChat(msg);
    });
    
    scrollToBottom();
  }
  
  // Add a single message to the chat
  function addMessageToChat(msg) {
    // Remove "no messages" placeholder if it exists
    const noMessagesDiv = chatMessages.querySelector('.text-center');
    if (noMessagesDiv) noMessagesDiv.remove();
    
    // Check if message already exists (prevent duplicates)
    if (document.querySelector(`[data-message-id="${msg.id}"]`)) {
      return;
    }
    
    const messageElement = createMessageElement(msg);
    chatMessages.appendChild(messageElement);
    
    // Only scroll if user is near bottom
    const isNearBottom = chatMessages.scrollHeight - (chatMessages.scrollTop + chatMessages.clientHeight) < 100;
    if (isNearBottom) {
      scrollToBottom();
    }
  }
  
  // Send message to server
  function sendMessage(message) {
    const button = messageForm.querySelector('button[type="submit"]');
    button.disabled = true;
    
    // Optimistically add the message to the chat
    const tempMessage = {
      id: 'temp-' + Date.now(),
      message: message,
      sender_id: currentUserId,
      employee_name: document.body.dataset.userName,
      formattedTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: new Date().toISOString(),
      isCurrentUser: true
    };
    
    addMessageToChat(tempMessage);
    scrollToBottom();
    
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
        // Replace temporary message with real one when server responds
        const tempElement = document.querySelector(`[data-message-id="${tempMessage.id}"]`);
        if (tempElement) {
          tempElement.remove();
        }
      }
    })
    .catch(error => {
      console.error('Error sending message:', error);
      showError('Failed to send message. Please try again.');
    })
    .finally(() => {
      button.disabled = false;
    });
  }
  
  // Create message element
  function createMessageElement(msg) {
    const isCurrentUser = msg.isCurrentUser;
    const messageClass = isCurrentUser ? 'message-out' : 'message-in';
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `mb-4 ${messageClass} p-3 animate-message`;
    messageDiv.dataset.messageId = msg.id;
    
    if (!isCurrentUser) {
      messageDiv.innerHTML = `
        <div class="flex items-start space-x-3">
          <img src="/images/default-user.png" 
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
  
  // Show "no messages" placeholder
  function showNoMessages() {
    chatMessages.innerHTML = `
      <div class="text-center py-10 text-gray-500">
        <i class="fas fa-comments text-4xl mb-3"></i>
        <p>No messages yet. Start the conversation!</p>
      </div>
    `;
  }
  
  // Scroll to bottom
  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  
  // Show error message
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