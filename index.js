const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname)));

// Serve the client page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'client.html'));
});

// Store users and their rooms
const users = {};
// Store typing status
const typingUsers = {};
// Store rooms with message history
const rooms = {
  'general': { name: 'General Chat', messages: [] },
  'technology': { name: 'Technology', messages: [] },
  'gaming': { name: 'Gaming', messages: [] }
};

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  // Handle user joining a room
  socket.on('join', (data) => {
    // Store user data
    const user = {
      id: socket.id,
      nickname: data.nickname,
      room: data.room || 'general'
    };
    
    users[socket.id] = user;
    
    // Join the specified room
    socket.join(user.room);
    
    // Notify everyone in the room that a user has joined
    io.to(user.room).emit('userJoined', {
      nickname: user.nickname,
      timestamp: new Date().toISOString()
    });
    
    // Send current rooms to the user
    socket.emit('roomList', Object.keys(rooms).map(key => ({
      id: key,
      name: rooms[key].name
    })));
    
    // Send message history to the user
    if (rooms[user.room].messages) {
      socket.emit('messageHistory', rooms[user.room].messages);
    }
    
    // Send join confirmation
    socket.emit('joinSuccess', {
      roomId: user.room,
      roomName: rooms[user.room].name
    });
    
    console.log(`${user.nickname} joined room: ${user.room}`);
  });
  
  // Handle chat messages
  socket.on('chatMessage', (data) => {
    const user = users[socket.id];
    if (!user) return;
    
    // Create message object
    const message = {
      content: data.message,
      nickname: user.nickname,
      timestamp: new Date().toISOString(),
      id: socket.id,
      type: 'text'
    };
    
    // Store message in room history
    if (!rooms[user.room].messages) {
      rooms[user.room].messages = [];
    }
    rooms[user.room].messages.push(message);
    
    // Limit message history (keep last 100 messages)
    if (rooms[user.room].messages.length > 100) {
      rooms[user.room].messages.shift();
    }
    
    // Send to everyone in the room including sender
    io.to(user.room).emit('message', message);
    
    // Reset typing status
    if (typingUsers[socket.id]) {
      delete typingUsers[socket.id];
      io.to(user.room).emit('typingStatus', Object.values(typingUsers));
    }
  });
  
  // Handle image messages
  socket.on('imageMessage', (data) => {
    const user = users[socket.id];
    if (!user) return;
    
    // Create message object for image
    const message = {
      content: data.image, // Base64 encoded image
      text: data.text || '', // Optional text with the image
      nickname: user.nickname,
      timestamp: new Date().toISOString(),
      id: socket.id,
      type: 'image'
    };
    
    // Store message in room history
    if (!rooms[user.room].messages) {
      rooms[user.room].messages = [];
    }
    rooms[user.room].messages.push(message);
    
    // Limit message history (keep last 100 messages)
    if (rooms[user.room].messages.length > 100) {
      rooms[user.room].messages.shift();
    }
    
    // Send to everyone in the room including sender
    io.to(user.room).emit('message', message);
  });
  
  // Handle typing status
  socket.on('typing', (isTyping) => {
    const user = users[socket.id];
    if (!user) return;
    
    if (isTyping) {
      typingUsers[socket.id] = user.nickname;
    } else if (typingUsers[socket.id]) {
      delete typingUsers[socket.id];
    }
    
    // Send updated typing statuses to everyone in the room
    io.to(user.room).emit('typingStatus', Object.values(typingUsers));
  });
  
  // Handle room change
  socket.on('changeRoom', (newRoom) => {
    const user = users[socket.id];
    if (!user) return;
    
    // Leave current room
    socket.leave(user.room);
    io.to(user.room).emit('userLeft', {
      nickname: user.nickname,
      timestamp: new Date().toISOString()
    });
    
    // Join new room
    user.room = newRoom;
    socket.join(newRoom);
    
    // Send message history to the user
    if (rooms[user.room].messages) {
      socket.emit('messageHistory', rooms[user.room].messages);
    }
    
    io.to(newRoom).emit('userJoined', {
      nickname: user.nickname,
      timestamp: new Date().toISOString()
    });
    
    // Send join confirmation
    socket.emit('joinSuccess', {
      roomId: newRoom,
      roomName: rooms[newRoom].name
    });
    
    console.log(`${user.nickname} changed room to: ${newRoom}`);
  });
  
  // Handle explicit logout
  socket.on('logout', () => {
    const user = users[socket.id];
    if (user) {
      // Notify room members if user was in a room
      if (user.room) {
        io.to(user.room).emit('userLeft', {
          nickname: user.nickname,
          timestamp: new Date().toISOString()
        });
      }
      
      // Remove from typing users if present
      if (typingUsers[socket.id]) {
        delete typingUsers[socket.id];
        if (user.room) {
          io.to(user.room).emit('typingStatus', Object.values(typingUsers));
        }
      }
      
      // Clean up user data
      delete users[socket.id];
      console.log(`${user.nickname} logged out`);
    }
    
    // Confirm logout to client
    socket.emit('logoutSuccess');
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      // Notify room members if user was in a room
      if (user.room) {
        io.to(user.room).emit('userLeft', {
          nickname: user.nickname,
          timestamp: new Date().toISOString()
        });
      }
      
      // Remove from typing users if present
      if (typingUsers[socket.id]) {
        delete typingUsers[socket.id];
        if (user.room) {
          io.to(user.room).emit('typingStatus', Object.values(typingUsers));
        }
      }
      
      delete users[socket.id];
      console.log(`${user.nickname} disconnected`);
    }
  });
});

// Start the server
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});