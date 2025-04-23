/*
How does the Socket.io server work and establish WebSocket connections in this case?
We create an HTTP server using the express app instance and then pass that server to Socket.IO.
This allows Socket.IO to use the same server instance for both HTTP and WebSocket connections.
We set up a listener for the 'connection' event on the Socket.IO server.
When a client connects, Socket.IO emits a 'connection' event, and we can handle that event to set up the connection.

On the client side, we use the Socket.IO client library to connect to the server.
The client library automatically handles the WebSocket connection and falls back to other transport methods if WebSockets are not supported.
When the client page loads, the Socket.IO client library (socket.io.min.js) is included, and it connects to the server using the URL of the server.
The client then creates a connection by calling io(). This establishes a WebSocket connection to the server.

The connection remains open until either the client or server closes it, allowing for real-time bidirectional communication.
There are the two cases in the code:
- Connecting:
  Server-side: io.on('connection', (socket) => { ... }) listens for new connections from clients.
  Client-side: const socket = io() creates a new connection to the server.

- Disconnecting:
  Server-side: socket.on('disconnect', () => { ... }) listens for disconnection events from clients. An explicit logout event is also handled.
  When a client disconnects or logs out, the server cleans up resources as well as notifies other clients in the room.
  Client-side: socket.disconnect() can be called to explicitly disconnect from the server. Also socket.emit(logout) is used to notify the server about the logout event.
- Reconnecting: The Socket.IO client library automatically attempts to reconnect to the server if the connection is lost.
*/

const express = require('express'); // Import express, a web framework for Node.js
// It is used to create a web server and handle HTTP requests.
const http = require('http'); // Import http, a built-in Node.js module for creating HTTP servers.
const { Server } = require('socket.io'); // Import socket.io
const path = require('path'); // Import path, a built-in Node.js module for handling file and directory paths.

const app = express(); // Create an instance of express
// This instance will be used to configure the web server and handle requests.
const server = http.createServer(app); // Create an HTTP server using the express app instance
// This server will be used to handle WebSocket connections with Socket.IO.
const io = new Server(server); // Create a new Socket.IO server instance using the HTTP server
// This instance will be used to handle real-time communication between clients and the server.

// Serve static files
app.use(express.static(path.join(__dirname))); // Any static files (like HTML, CSS, JS) in the current directory will be served by express.

// Serve the client page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'client.html')); // When a GET request is made to the root URL, send the client.html file as a response.
  // This file will be the main page for the chat application.
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
// This event is triggered when a new client connects to the server via WebSocket.
// The socket parameter represents the connection to the client.
io.on('connection', (socket) => {
  // Log the connection
  // This will log the socket ID of the connected user to the console.
  console.log('A user connected:', socket.id);
  
  // Handle user joining a room
  // This event is triggered when a user sends a 'join' event to the server.
  // The data parameter contains the user's nickname and the room they want to join.
  socket.on('join', (data) => {
    // Store user data
    const user = {
      id: socket.id,
      nickname: data.nickname,
      room: data.room || 'general'
    };
    
    users[socket.id] = user; // Store the user in the users object using their socket ID as the key.
    
    // Join the specified room
    socket.join(user.room);
    
    // Notify everyone in the room that a user has joined
    // io.to(user.room) sends a message to all sockets in the specified room.
    // emit('userJoined') sends a message to the room with the user's nickname and timestamp.
    io.to(user.room).emit('userJoined', {
      nickname: user.nickname,
      timestamp: new Date().toISOString()
    });
    
    // Send current rooms to the user
    // Object.keys(rooms) gets an array of room names from the rooms object.
    // socket.emit is the function used to send a message to the client.
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
    
    // Log the user joining the room
    console.log(`${user.nickname} joined room: ${user.room}`);
  });
  
  // Handle chat messages
  // This event is triggered when a user sends a chat message to the server.
  // The data parameter contains the message content.
  // The message is then broadcasted to all users in the same room.
  // .on('chatMessage') listens for the 'chatMessage' event from the client.
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
    // This will remove the typing status of the user who sent the message.
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
      // shift() removes the first element from an array and returns it.
      // This is used to keep the message history limited to the last 100 messages.
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

/*

MESSAGE SENDING METHODS:
socket.emit('eventName', data) - Sends an event to the client from the server (one way).
Only the client connected to the specific socket will receive this event.

io.emit('eventName', data) - Sends an event to all connected clients from the server (broadcast).
io.to(room).emit('eventName', data) - Sends an event to all clients in a specific room.
This is useful for broadcasting messages to a specific group of users.

socket.broadcast.emit('eventName', data) - Sends an event to all clients except the sender.
socket.broadcast.to(room).emit('eventName', data) - Sends an event to all clients in a specific room except the sender.
This is useful for notifying all other users in a room about an event that occurred.

ROOM MANAGEMENT:
socket.join(room) - Adds the socket to a specific room. This allows for grouping sockets together.
socket.leave(room) - Removes the socket from a specific room.

EVENT HANDLING:
socket.on('eventName', (data) => { ... }) - Listens for an event from the client.
This is how the server receives messages from the client - events like sending messages, typing, etc.
io.on('eventName', (data) => { ... }) - Listens for an event from all clients.
This is used for handling events that are not specific to a single socket, like connection and disconnection events.

IO and SOCKET OBJECTS:
io - The main Socket.IO server instance. It is used to manage all connected sockets and rooms.
Server-level instance of Socket.IO. Manages all connections, handles server event like initial connections,
can broadcast messages to all clients or specific rooms.


socket - Represents a single connection to a client. Each client has its own socket object.
Client-specific instance of Socket.IO. Represents a single connection to a client. Maintains state for a single user,
can send messages to that specific client, and can join/leave rooms. Enables communications between server and specific client.
*/