const express = require('express');
var cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');
const { group, log } = require('console');
const { stat } = require('fs');
const { env } = require('process');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
	cors: { origin: "*" }
});
const PORT = process.env.PORT || 3000;
app.use(bodyParser.json());
app.use(cors())

const users_hr = [];
const users = [];
const users_block = [];
const groups = [];
const seenNotfiWebhook = '';


const USER_CONNECT_SUCCESS = 'Tài khoản kết nối thành công.';
const USER_HAS_BEEN_BLOCK = 'Quản lý đã khóa tài khoản của bạn. Để tiếp tục, bạn vui lòng liên hệ quản lý để khắc phục.'
const USER_ALREADY_CONNECT = 'Tài khoản đã kết nối.'

//
// socket
//

io.on('connection', function (socket) {

	console.log('socket.connected', socket.id);

	socket.on('user_connected', function (data) {

		var { user_id, name_user, store, time_login, group, cid_level } = data;
		var user = {
			id: socket.id,
			user_id: user_id,
			name_user: name_user,
			store: store,
			time_login: time_login,
			group: group,
			cid_level: cid_level,
			platform: ''
		};

		var isHRManager = false;
		if (user.cid_level == 25 || user.cid_level == 0) {
			isHRManager = true;
		}

		if (!isHRManager && searchUserWith(user.user_id, { property_match: 'user_id', default_list: users_block }) != null) {
			console.log('Account blocked.');

			socket.emit('user_connected_response', { 'isConnected': false, 'reason': USER_HAS_BEEN_BLOCK });
			return;
		}

		if (!isHRManager && searchUserWith(user.user_id, { property_match: 'user_id', default_list: users }) != null) {
			console.log('User already connected.');

			socket.emit('user_connected_response', { 'isConnected': false, 'reason': USER_ALREADY_CONNECT });
			return;
		}

		users.push(user);
		io.emit('getalluserclient', userGroupBySite(user.store));
		console.log(`user.online ${user_id}`, user);
		socket.emit('user_connected_response', { 'isConnected': true, 'reason': USER_CONNECT_SUCCESS })

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
			users.splice(index, 1);

			io.emit('getalluserclient', userGroupBySite(users[index]['store']));
			console.log("disconnect.success");

		}

		console.log("disconnect", socket.id)
	});
});

//
// api
//
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


app.post('/api/v1/kickUser', function (req, res) {

	var { userId } = req.body;
	if (!isAuthen(req)) {
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
	if (!isAuthen(req)) {
		res.json(new ResponseData(true, 'Thiếu token hoặc token không hợp lệ', null))
		return;
	}
	console.log('>> request.blockUser', userId, status)
	var response = blockUser(userId, status);
	return res.json(response);
});

app.get('/api/v1/getListUserBlock', function (req, res) {
	if (!isAuthen(req)) {
		res.json(new ResponseData(true, 'Thiếu token hoặc token không hợp lệ', null))
		return;
	}
	var data = ResponseData.success({ message: 'success', data: users_block });
	res.json(data);
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

///
/// function helper
///



function searchUserWith(property_actual, { property_match = 'id', default_list = users } = {}) {

	var index = default_list.findIndex(e => e[`${property_match}`] == property_actual)
	if (index == -1)
		return null;
	return default_list[index];
}

function disconnectUser(userId) {

}


function userGroupBySite(siteID) {

	var userGroupBySite = users;
	if (siteID != 'H001')
		userGroupBySite = users.filter(e => e['store'] == siteID);

	return userGroupBySite;
}


function blockUser(userId, status) {


	// Nếu trạng thái = true, block user thì list_search là danh sách users
	// Ngược lại là bỏ block user, thì list_search sẽ là danh sách users_block
	console.log('>> list use is:', status ? 'users' : 'users_block')

	var user = searchUserWith(userId, { property_match: 'user_id', default_list: status ? users : users_block });
	console.log('>> blockUser', userId, status, 'result: ', user)

	if (user != null) {
		if (status) {
			users.splice(users.indexOf(user), 1);
			users_block.push(user);

			io.to(user.id).emit('disconnect_user', { 'reason': USER_HAS_BEEN_BLOCK })
			console.log('>> disconnect_user client', user)

		}
		else {
			// users.splice(users.indexOf(user), 1);
			users_block.splice(users_block.indexOf(user), 1);
			console.log('> unblocked user')
			console.log('> users_block.length', users_block.length)
		}
		console.log("getalluserclient", userGroupBySite(user.store))
		io.emit('getalluserclient', userGroupBySite(user.store));

		return new ResponseData(false, (status ? 'block ' : 'unblock ').concat('success'), null);
	}
	else if (user == null) {
		return new ResponseData(false, 'User not found', null);
	}
}

function isAuthen(req) {
	if (req.headers['token'] == undefined || req.headers['token'].length < 12) {
		return false;
	}
	return true;
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