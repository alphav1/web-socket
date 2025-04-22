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
// Store rooms (default to 'general')
const rooms = {
  'general': { name: 'General Chat' },
  'technology': { name: 'Technology' },
  'gaming': { name: 'Gaming' }
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
      nickname: user.nickname,
      timestamp: new Date().toISOString(),
      id: socket.id,
      type: 'image'
    };
    
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
    io.to(newRoom).emit('userJoined', {
      nickname: user.nickname,
      timestamp: new Date().toISOString()
    });
    
    console.log(`${user.nickname} changed room to: ${newRoom}`);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      io.to(user.room).emit('userLeft', {
        nickname: user.nickname,
        timestamp: new Date().toISOString()
      });
      
      delete users[socket.id];
      
      // Remove from typing users if present
      if (typingUsers[socket.id]) {
        delete typingUsers[socket.id];
        io.to(user.room).emit('typingStatus', Object.values(typingUsers));
      }
      
      console.log(`${user.nickname} disconnected`);
    }
  });
});

// Start the server
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});