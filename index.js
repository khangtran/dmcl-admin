const express = require('express');
const axios = require('axios');
// const { log, group, time } = require('console');
// const { message } = require('laravel-mix/src/Log');
const bodyParser = require('body-parser');
const { group } = require('console');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
	cors: { origin: "*" }
});
const PORT = 3000;
app.use(bodyParser.json());
// app.use(cors())

const users = [];
const groups = [];
const seenNotfiWebhook = '';

io.on('connection', function (socket) {

	console.log('socket.connected', socket.id);

	socket.on('user_connected', function (data) {

		var { user_id, name_user, store, time_login, group } = data;
		var player = {
			id: socket.id,
			user_id: user_id,
			name_user: name_user,
			store: store,
			time_login: time_login,
			group: group
		};

		users.push(player);
		io.emit('getalluserclient', users);
		console.log(`user.online ${user_id}`, player);

		if (group != null || group != undefined)
			for (var i in group) {

				socket.join(i)
				console.log(`> user.registerGroup ${i}`)

				var index = groups.findIndex(e => e == i);
				if (index != -1) {

					groups.push(i)
					console.log(`> group.registerNew ${i}`)
				}
			}

	});

	socket.on('getalluser', function () {
		io.emit('getalluserclient', users);
		console.log(`user.all`, users.length);
	});

	socket.on('user_disconnected', function (id_socket) {

		io.to(id_socket).emit('disconnect_user', id_socket);

		io.emit('getalluserclient', users);
		console.log(`disconnected ${id_socket}`);
	});

	socket.on('user_kick', function (id_socket) {
		io.to(id_socket).emit('disconnect_user', id_socket);

		io.emit('getalluserclient', users);
		console.log(`user.kick disconnected ${id_socket}`);
	});

	socket.on('user_ban', function (id_socket) {
		io.to(id_socket).emit('disconnect_user', id_socket);

		io.emit('getalluserclient', users);
		console.log(`user.ban disconnected ${id_socket}`);
	});

	socket.on('send-notifi', function (data) {
		var { toId, fromId, message, title, level, group, } = data;

		var userIndex = users.findIndex(e => e.user_id == toId);
		if (userIndex = !-1) {
			var userSocketId = users[userIndex].id;
			io.to(userSocketId).emit('send-noti');
		}
		else {
			console.log('not found user ', toId);
		}
	});

	socket.on('seen-notifi', function (data) {
		var { userId, timeSeen } = data;
		var url = `seenNotfiWebhook?userId=${userId}&timeseen=${timeSeen}`
		fetch(url);
	})

	socket.on('disconnect', function () {
		var index = users.findIndex(elem => elem.id === socket.id);
		if (index != -1)
			users.splice(index, 1);

		io.emit('getalluserclient', users);
		console.log("User disconnect");
	});
});

// api
app.get('/api/v1', function (req, res) {
	var response = ResponseData.success({
		data: {
			api: 'ĐMCL API Socket.io',
			version: 'v1', schema: [{
				url: '/api/v1/pushnotifi',
				method: 'get',
				arg: { message: 'string', title: 'string', level: 'string', group: 'array<string>', fromId: 'string', extradata: 'jsonoject' }
			}, { url: '/api/v1/getallgroup', method: 'get', arg: {}, response: { type: 'array<string>' } }]
		}
	})
	res.json(response);
});

app.post('/api/v1/pushnotifi', function (req, res) {
	var param = req.body;
	var userResquestGroups = param.groups;
	var response = ResponseData.success({ data: { notificationId: 1000, param: param } });

	if (userResquestGroups != null) {
		var isMatchGroups = true;
		for (var i in groups)
			for (var j in userResquestGroups) {
				if (i != j)
					isMatchGroups = false;
			}

		if (!isMatchGroups) {
			response = ResponseData.error({ message: 'wrong group register', data: null });
			res.json(response);
		}

		for (var i in groups)
			io.to(i).emit('send-notifi', param)
	}
	else
		response = ResponseData.error({ message: 'groups empty', data: null })

	res.json(response)
})

app.get('/api/v1/getallgroup', function (req, res) {
	var response = ResponseData.success({ data: groups })
	res.json(response)
})

app.post('/api/v1/setwebhook', function (req, res) {
	var { url_webhook } = req.body
	var response = ResponseData.success({ data: url_webhook });
	res.json(response);
})

server.listen(PORT, () => {
	console.log(`Server is running ${PORT}`);
});


// function ResponseData(isError, message, data) {
// 	return {
// 		isError: isError, message: message, data: data
// 	}
// }


class ResponseData {

	constructor(isError, message, data) {
		this.isError = isError
		this.message = message
		this.data = data
	}

	static success({ message = 'success', data }) {
		return new ResponseData(true, message, data);
	}

	static error({ message = 'fail', data }) {
		return new ResponseData(false, message, data);
	}
}