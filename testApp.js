var express = require('express'),
	db = require('./db/testMysql.js'),
	config = require('./config.js'),
	app = express(),
	server = require('https').createServer(config.keys,app),
	io = require('socket.io').listen(server, {log:false}),
	util = require('util'),
	fs = require('fs'),
	exec = require('child_process').exec;

var logStream = fs.createWriteStream('logs/testApp-'+String(Date.now())+'.txt');
function log (str, obj) {
	logStream.write(Date.now()+', '+str+', '+util.format('%j',obj)+'\n');
}

exec('/usr/local/mysql/bin/mysql -uroot -psql testOpen < db/createAndSeedTest.sql', function (err, stdout, stderr) {
if(err) console.log(err);

	server.listen(4000,function(){
		log('Listening',{});
		console.log('Listening on port 4000');
	});

	io.configure(function (){
		io.set('authorization', function (handshake, cb) {
			log('auth handshake',handshake.query);
			console.log('handshaking');
			if(handshake.query.uid < 10) {
				return cb(null, true); 
			} else {
				return cb(null, false);
			}
		});
	});
	// user known at this point

	io.sockets.on('connection', function (socket) {
		log('CONNECTION',{socket:socket.id});

		// 'bind' a socket to events attending and friends, so they receive a real time updates; pubsub
		// requires: {uid}
		// returns: success: {}, failure: {error}
		socket.on('bind', function (data, cb) {
			log('BIND',data);
			db.getFriends(data.uid, function (friends) {
				friends.forEach( function (f) {
					socket.join('friend:'+f.uid);
				});
				db.getAttended(data.uid, function (events) {
					events.forEach( function (e) {
						socket.join('event:' + e.eid);
					});
					return cb({});
				});
			});
		});

		// requires: {uid,start,end,type}
		// emits: newOtb:{eid,start,end,type,attendees[]}
		// returns: success: {eid}, failure: {error}
		socket.on('open', function (data, cb) {
			log('OPEN',data);
			console.log(util.format('OPEN: %j',data));
			db.newOtb(data, function(eid) {
				cb({eid:eid});
				return socket.broadcast.to('friend:'+data.uid).emit('newOtb', {
					eid  : eid,
					start: data.start,
					end  : data.end,
					type : data.type,
					attendees:[data.uid]
				});
			});
			// push notify
		});

		// requires: {uid,eid,deletes[]}
		// emits: {uid,eid}
		// returns: success: {}, failure: {error}
		socket.on('join', function (data, cb) {
			log('JOIN',data);
			console.log(util.format('JOIN: %j',data));
			db.joinEvent(data.uid, data.eid, function () {
				cb({});
				return socket.broadcast.to('event:'+data.eid).emit('joinEvent',{
					uid: data.uid,
					eid: data.eid
				});
			});
			// push notify
		});

		// requires: {uid,eid,field,value}
		//	field: [start,end,type,location]
		// emits: {eid,field,value}
		// returns: success: {}, failure: {error}
		socket.on('update', function (data, cb) {
			log('UPDATE',data);
			console.log(util.format('UPDATE: %j',data));
			db.updateEvent(data.eid,data.field,data.value, function () {
				cb({});
				return socket.broadcast.to('event:'+data.eid).emit('updateEvent',{
					eid  : data.eid,
					field: data.field,
					value: data.value
				});
			});
		});

		socket.on('newUser', function (data, cb) {
			log('NEWUSER',data);
			console.log(util.format('NEWUSER: %j',data));
			// db
			return cb({});
		});

		socket.on('disconnect', function () {
			log('DISCONNECT',{socket:socket.id});
		});

	////////////////////////// TEST METHODS ///////////////////////////
	// test remote behavior, like receiving messages on device,
	// test event triggers timeout methods to test behavior

		// requires: {type,name[,data{}...]}
		//	type: [socket,push]
		socket.on('test', function (data) {
			// phone receiving via socket
			log('TEST',data);
			if (data.type === 'socket') {
				if (data.name === 'receiveNewOtb') {
					setTimeout(function() {
						var response = {
							eid  : data.data.eid,
							start: data.data.start,
							end  : data.data.end,
							type : data.data.type,
							attendees:[data.data.uid]
						}
						log('sending',response);
						io.sockets.in('friend:'+data.data.uid).emit('newOtb',response);
					}, 1000);
				} else if (data.name === 'receiveJoin') {
					setTimeout(function() {
						var response = {
							uid: data.data.uid,
							eid: data.data.eid
						}
						log('sending',response);
						io.sockets.in('event:'+data.data.eid).emit('joinEvent',response);
					}, 1000);
				} else if (data.name === 'receiveUpdate') {
					setTimeout(function() {
						var response = {
							eid  : data.data.eid,
							field: data.data.field,
							value: data.data.value
						}
						log('sending',response)
						io.sockets.in('event:'+data.data.eid).emit('updateEvent',response);
					}, 1000);
				} else if (data.name === 'createThenJoin') {
					setTimeout(function() {
						io.sockets.in('event:'+data.data.eid).emit('joinEvent',{
							uid: data.uid,
							eid: data.eid
						});
					}, 5000);
				}
			// phone receiving via push notification
			} else if (data.type === 'push') {
				if (data.name === 'receiveNewOtb') {

				} else if (data.name === 'receiveJoin') {

				} else if (data.name === 'receiveUpdate') {

				}
			}

		});
	}); 


});

