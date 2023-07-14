const express = require('express');
const axios = require('axios');
// const { log, group, time } = require('console');
// const { message } = require('laravel-mix/src/Log');
const bodyParser = require('body-parser');
const { group } = require('console');
const { stat } = require('fs');
const { env } = require('process');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
	cors: { origin: "*" }
});
const PORT = process.env.PORT || 3000;
app.use(bodyParser.json());
// app.use(cors())

const users = [];
const users_block = [];
const groups = [];
const seenNotfiWebhook = '';


const USER_BLOCK_MESSAGE = 'Quản lý đã khóa tài khoản của bạn. Để tiếp tục, bạn vui lòng liên hệ quản lý để khắc phục.'
const USER_ALREADY_CONNECT = 'Tài khoản đã kết nối.'


io.on('connection', function (socket) {

	console.log('socket.connected', socket.id);

	socket.on('user_connected', function (data) {

		var { user_id, name_user, store, time_login, group } = data;
		var user = {
			id: socket.id,
			user_id: user_id,
			name_user: name_user,
			store: store,
			time_login: time_login,
			group: group
		};

		if (searchUserWith(user.user_id, { property_match: 'user_id', default_list: users_block }) != null) {
			console.log('Account blocked.');

			socket.emit('user_connected_response', { 'isConnected': false, 'reason': USER_BLOCK_MESSAGE });
			return;
		}

		if (searchUserWith(user.user_id, { property_match: 'user_id', default_list: users }) != null) {
			console.log('User already connected.');

			socket.emit('user_connected_response', { 'isConnected': false, 'reason': USER_ALREADY_CONNECT });
			return;
		}

		users.push(user);
		io.emit('getalluserclient', userGroupBySite(user.store));
		console.log(`user.online ${user_id}`, user);
		socket.emit('user_connected_response', { 'isConnected': true, 'reason': 'Permission allow' })

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

		if (index != -1) {
			io.emit('getalluserclient', userGroupBySite(users[index]['store']));

			users.splice(index, 1);
			console.log("User disconnect");

		} else {
			console.log("Not found", socket.id)
		}

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

app.get('/api/v1/getListUserBlock', function (req, res) {

	if (req.headers['token'] == undefined || req.headers['token'].length < 6) {
		res.json(new ResponseData(true, 'Thiếu token hoặc token không hợp lệ', null))
		return;
	}

	var response = new ResponseData(false, 'success', users_block);

	return res.json(response);
});

app.post('/api/v1/kickUser', function (req, res) {

	var { userId } = req.body;
	if (req.headers['token'] == undefined || req.headers['token'].length < 12) {
		res.json(ResponseData.error({ message: 'Thiếu token hoặc token không hợp lệ', data: null }))
		return;
	}

	console.log('>> request.kickUser', userId)
	var response = new ResponseData(false, 'success', null)
	var user = searchUserWith(userId, { property_match: 'user_id', default_list: users });
	if (user != null) {
		return res.json(response);
	}


	return res.json(ResponseData.error({ message: 'userId not found ', data: null }));
})

app.post('/api/v1/blockUser', function (req, res) {
	var { userId, status } = req.body;
	req.headers.authorization
	if (req.headers['token'] == undefined || req.headers['token'].length < 12) {
		res.json(new ResponseData(true, 'Thiếu token hoặc token không hợp lệ', null))
		return;
	}
	console.log('>> request.blockUser', userId, status)
	var response = blockUser(userId, status);
	return res.json(response);
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

function searchUserWith(property, { property_match = 'id', default_list = users } = {}) {

	var index = default_list.findIndex(e => e[`${property_match}`] == property)
	if (index == -1)
		return null;
	return default_list[index];
}

function disconnectUser(userId) {

}


function userGroupBySite(siteID) {
	var userGroupBySite = users.filter(e => e['store'] == siteID);
	return userGroupBySite;
}


function blockUser(userId, status) {


	// Nếu trạng thái = true, block user thì list_search là danh sách users
	// Ngược lại là bỏ block user, thì list_search sẽ là danh sách users_block
	console.log('>> blockUser', userId, status)
	console.log('>> list use is', status ? 'users' : 'users_block')

	var user = searchUserWith(userId, { property_match: 'user_id', default_list: status ? users : users_block });
	if (user != null) {
		if (status) {
			users.splice(users.indexOf(user), 1);
			users_block.push(user);

			io.to(user.id).emit('disconnect_user', { 'reason': USER_BLOCK_MESSAGE })
			console.log('>> disconnect_user client')

		}
		else {
			// users.splice(users.indexOf(user), 1);
			users_block.splice(users_block.indexOf(user), 1);
			console.log('> unblocked user')
			console.log('> users_block.length', users_block.length)
		}
		return new ResponseData(false, (status ? 'block ' : 'unblock ').concat('success'), null);
	}
	else if (user == null) {
		return new ResponseData(false, 'User not found', null);
	}
}

class ResponseData {

	constructor(isError, message, data) {
		this.isError = isError
		this.message = message
		this.data = data == undefined ? null : data
	}

	static success({ message = 'success', data }) {
		return new ResponseData(true, message, data);
	}

	static error({ message = 'fail', data }) {
		return new ResponseData(false, message, data);
	}
}