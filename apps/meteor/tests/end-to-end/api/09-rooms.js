import fs from 'fs';
import path from 'path';

import { expect } from 'chai';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';

import { sleep } from '../../../lib/utils/sleep';
import { getCredentials, api, request, credentials } from '../../data/api-data.js';
import { sendSimpleMessage, deleteMessage } from '../../data/chat.helper';
import { drawioURL, imgURL, lstURL, svgLogoFileName, svgLogoURL } from '../../data/interactions';
import { getSettingValueById, updateEEPermission, updatePermission, updateSetting } from '../../data/permissions.helper';
import { createRoom, deleteRoom } from '../../data/rooms.helper';
import { deleteTeam } from '../../data/teams.helper';
import { password } from '../../data/user';
import { createUser, deleteUser, login } from '../../data/users.helper';
import { IS_EE } from '../../e2e/config/constants';

describe('[Rooms]', function () {
	this.retries(0);

	before((done) => getCredentials(done));

	it('/rooms.get', (done) => {
		request
			.get(api('rooms.get'))
			.set(credentials)
			.expect(200)
			.expect((res) => {
				expect(res.body).to.have.property('success', true);
				expect(res.body).to.have.property('update');
				expect(res.body).to.have.property('remove');
			})
			.end(done);
	});

	it('/rooms.get?updatedSince', (done) => {
		request
			.get(api('rooms.get'))
			.set(credentials)
			.query({
				updatedSince: new Date(),
			})
			.expect(200)
			.expect((res) => {
				expect(res.body).to.have.property('success', true);
				expect(res.body).to.have.property('update').that.have.lengthOf(0);
				expect(res.body).to.have.property('remove').that.have.lengthOf(0);
			})
			.end(done);
	});

	describe('/rooms.saveNotification:', () => {
		let testChannel;

		before(async () => {
			testChannel = (await createRoom({ type: 'c', name: `channel.test.${Date.now()}-${Math.random()}` })).body.channel;
		});

		after(() => deleteRoom({ type: 'c', roomId: testChannel._id }));

		it('/rooms.saveNotification:', (done) => {
			request
				.post(api('rooms.saveNotification'))
				.set(credentials)
				.send({
					roomId: testChannel._id,
					notifications: {
						disableNotifications: '0',
						emailNotifications: 'nothing',
						audioNotificationValue: 'beep',
						desktopNotifications: 'nothing',
						mobilePushNotifications: 'mentions',
					},
				})
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
				})
				.end(done);
		});
	});

	describe('/rooms.upload', () => {
		let testChannel;
		let user;
		let userCredentials;
		const testChannelName = `channel.test.upload.${Date.now()}-${Math.random()}`;
		let blockedMediaTypes;
		let testPrivateChannel;

		before(async () => {
			user = await createUser({ joinDefaultChannels: false });
			userCredentials = await login(user.username, password);
			testChannel = (await createRoom({ type: 'c', name: testChannelName })).body.channel;
			testPrivateChannel = (await createRoom({ type: 'p', name: `channel.test.private.${Date.now()}-${Math.random()}` })).body.group;
			blockedMediaTypes = await getSettingValueById('FileUpload_MediaTypeBlackList');
			const newBlockedMediaTypes = blockedMediaTypes
				.split(',')
				.filter((type) => type !== 'image/svg+xml')
				.join(',');
			await updateSetting('FileUpload_MediaTypeBlackList', newBlockedMediaTypes);
		});

		after(() =>
			Promise.all([
				deleteRoom({ type: 'c', roomId: testChannel._id }),
				deleteUser(user),
				updateSetting('FileUpload_Restrict_to_room_members', true),
				updateSetting('FileUpload_Restrict_to_users_who_can_access_room', false),
				updateSetting('FileUpload_ProtectFiles', true),
				updateSetting('FileUpload_MediaTypeBlackList', blockedMediaTypes),
				deleteRoom({ roomId: testPrivateChannel._id, type: 'p' }),
			]),
		);

		it("don't upload a file to room with file field other than file", (done) => {
			request
				.post(api(`rooms.upload/${testChannel._id}`))
				.set(credentials)
				.attach('test', imgURL)
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('error', '[invalid-field]');
					expect(res.body).to.have.property('errorType', 'invalid-field');
				})
				.end(done);
		});
		it("don't upload a file to room with empty file", (done) => {
			request
				.post(api(`rooms.upload/${testChannel._id}`))
				.set(credentials)
				.attach('file', '')
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('error', res.body.error);
				})
				.end(done);
		});
		it("don't upload a file to room with more than 1 file", (done) => {
			request
				.post(api(`rooms.upload/${testChannel._id}`))
				.set(credentials)
				.attach('file', imgURL)
				.attach('file', imgURL)
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('error', 'Just 1 file is allowed');
				})
				.end(done);
		});

		let fileNewUrl;
		let fileOldUrl;
		it('should upload a PNG file to room', async () => {
			await request
				.post(api(`rooms.upload/${testChannel._id}`))
				.set(credentials)
				.attach('file', imgURL)
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					const { message } = res.body;
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('message');
					expect(res.body.message).to.have.property('attachments');
					expect(res.body.message.attachments).to.be.an('array').of.length(1);
					expect(res.body.message.attachments[0]).to.have.property('image_type', 'image/png');
					expect(res.body.message.attachments[0]).to.have.property('title', '1024x1024.png');
					expect(res.body.message).to.have.property('files');
					expect(res.body.message.files).to.be.an('array').of.length(2);
					expect(res.body.message.files[0]).to.have.property('type', 'image/png');
					expect(res.body.message.files[0]).to.have.property('name', '1024x1024.png');

					fileNewUrl = `/file-upload/${message.file._id}/${message.file.name}`;
					fileOldUrl = `/ufs/GridFS:Uploads/${message.file._id}/${message.file.name}`;
				});
		});

		it('should upload a LST file to room', () => {
			return request
				.post(api(`rooms.upload/${testChannel._id}`))
				.set(credentials)
				.attach('file', lstURL)
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('message');
					expect(res.body.message).to.have.property('attachments');
					expect(res.body.message.attachments).to.be.an('array').of.length(1);
					expect(res.body.message.attachments[0]).to.have.property('format', 'LST');
					expect(res.body.message.attachments[0]).to.have.property('title', 'lst-test.lst');
					expect(res.body.message).to.have.property('files');
					expect(res.body.message.files).to.be.an('array').of.length(1);
					expect(res.body.message.files[0]).to.have.property('name', 'lst-test.lst');
					expect(res.body.message.files[0]).to.have.property('type', 'text/plain');
				});
		});

		it('should upload a DRAWIO file (unknown media type) to room', () => {
			return request
				.post(api(`rooms.upload/${testChannel._id}`))
				.set(credentials)
				.attach('file', drawioURL)
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('message');
					expect(res.body.message).to.have.property('attachments');
					expect(res.body.message.attachments).to.be.an('array').of.length(1);
					expect(res.body.message.attachments[0]).to.have.property('format', 'DRAWIO');
					expect(res.body.message.attachments[0]).to.have.property('title', 'diagram.drawio');
					expect(res.body.message).to.have.property('files');
					expect(res.body.message.files).to.be.an('array').of.length(1);
					expect(res.body.message.files[0]).to.have.property('name', 'diagram.drawio');
					expect(res.body.message.files[0]).to.have.property('type', 'application/octet-stream');
				});
		});

		it('should not allow uploading a blocked media type to a room', async () => {
			await updateSetting('FileUpload_MediaTypeBlackList', 'text/plain');
			await request
				.post(api(`rooms.upload/${testChannel._id}`))
				.set(credentials)
				.attach('file', lstURL)
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('errorType', 'error-invalid-file-type');
				});
		});

		it('should not allow uploading an unknown media type to a room if the default one is blocked', async () => {
			await updateSetting('FileUpload_MediaTypeBlackList', 'application/octet-stream');
			await request
				.post(api(`rooms.upload/${testChannel._id}`))
				.set(credentials)
				.attach('file', drawioURL)
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('errorType', 'error-invalid-file-type');
				});
		});

		it('should be able to get the file', async () => {
			await request.get(fileNewUrl).set(credentials).expect('Content-Type', 'image/png').expect(200);
			await request.get(fileOldUrl).set(credentials).expect('Content-Type', 'image/png').expect(200);
		});

		it('should be able to get the file when no access to the room if setting allows it', async () => {
			await updateSetting('FileUpload_Restrict_to_room_members', false);
			await updateSetting('FileUpload_Restrict_to_users_who_can_access_room', false);
			await request.get(fileNewUrl).set(userCredentials).expect('Content-Type', 'image/png').expect(200);
			await request.get(fileOldUrl).set(userCredentials).expect('Content-Type', 'image/png').expect(200);
		});

		it('should not be able to get the file when no access to the room if setting blocks', async () => {
			await updateSetting('FileUpload_Restrict_to_room_members', true);
			await request.get(fileNewUrl).set(userCredentials).expect(403);
			await request.get(fileOldUrl).set(userCredentials).expect(403);
		});

		it('should be able to get the file if member and setting blocks outside access', async () => {
			await updateSetting('FileUpload_Restrict_to_room_members', true);
			await request.get(fileNewUrl).set(credentials).expect('Content-Type', 'image/png').expect(200);
			await request.get(fileOldUrl).set(credentials).expect('Content-Type', 'image/png').expect(200);
		});

		it('should be able to get the file if not member but can access room if setting allows', async () => {
			await updateSetting('FileUpload_Restrict_to_room_members', false);
			await updateSetting('FileUpload_Restrict_to_users_who_can_access_room', true);

			await request.get(fileNewUrl).set(userCredentials).expect('Content-Type', 'image/png').expect(200);
			await request.get(fileOldUrl).set(userCredentials).expect('Content-Type', 'image/png').expect(200);
		});

		it('should not be able to get the file if not member and cannot access room', async () => {
			const { body } = await request
				.post(api(`rooms.upload/${testPrivateChannel._id}`))
				.set(credentials)
				.attach('file', imgURL)
				.expect('Content-Type', 'application/json')
				.expect(200);

			const fileUrl = `/file-upload/${body.message.file._id}/${body.message.file.name}`;

			await request.get(fileUrl).set(userCredentials).expect(403);
		});

		it('should respect the setting with less permissions when both are true', async () => {
			await updateSetting('FileUpload_ProtectFiles', true);
			await updateSetting('FileUpload_Restrict_to_room_members', true);
			await updateSetting('FileUpload_Restrict_to_users_who_can_access_room', true);
			await request.get(fileNewUrl).set(userCredentials).expect(403);
			await request.get(fileOldUrl).set(userCredentials).expect(403);
		});

		it('should not be able to get the file without credentials', async () => {
			await request.get(fileNewUrl).attach('file', imgURL).expect(403);
			await request.get(fileOldUrl).attach('file', imgURL).expect(403);
		});

		it('should be able to get the file without credentials if setting allows', async () => {
			await updateSetting('FileUpload_ProtectFiles', false);
			await request.get(fileNewUrl).expect('Content-Type', 'image/png').expect(200);
			await request.get(fileOldUrl).expect('Content-Type', 'image/png').expect(200);
		});

		it('should generate thumbnail for SVG files correctly', async () => {
			const expectedFileName = `thumb-${svgLogoFileName}`;
			let thumbUrl;
			await request
				.post(api(`rooms.upload/${testChannel._id}`))
				.set(credentials)
				.attach('file', svgLogoURL)
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					const { message } = res.body;
					const { files, attachments } = message;

					expect(files).to.be.an('array');
					const hasThumbFile = files.some((file) => file.type === 'image/png' && file.name === expectedFileName);
					expect(hasThumbFile).to.be.true;

					expect(attachments).to.be.an('array');
					const thumbAttachment = attachments.find((attachment) => attachment.title === svgLogoFileName);
					expect(thumbAttachment).to.be.an('object');
					thumbUrl = thumbAttachment.image_url;
				});

			await request.get(thumbUrl).set(credentials).expect('Content-Type', 'image/png');
		});

		it('should generate thumbnail for JPEG files correctly', async () => {
			const expectedFileName = `thumb-sample-jpeg.jpg`;
			let thumbUrl;
			await request
				.post(api(`rooms.upload/${testChannel._id}`))
				.set(credentials)
				.attach('file', fs.createReadStream(path.join(__dirname, '../../mocks/files/sample-jpeg.jpg')))
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					const { message } = res.body;
					const { files, attachments } = message;

					expect(files).to.be.an('array');
					const hasThumbFile = files.some((file) => file.type === 'image/jpeg' && file.name === expectedFileName);
					expect(hasThumbFile).to.be.true;

					expect(attachments).to.be.an('array');
					const thumbAttachment = attachments.find((attachment) => attachment.title === `sample-jpeg.jpg`);
					expect(thumbAttachment).to.be.an('object');
					thumbUrl = thumbAttachment.image_url;
				});

			await request.get(thumbUrl).set(credentials).expect('Content-Type', 'image/jpeg');
		});

		// Support legacy behavior (not encrypting file)
		it('should correctly save file description and properties with type e2e', async () => {
			await request
				.post(api(`rooms.upload/${testChannel._id}`))
				.set(credentials)
				.field('description', 'some_file_description')
				.attach('file', imgURL)
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('message');
					expect(res.body.message).to.have.property('attachments');
					expect(res.body.message.attachments).to.be.an('array').of.length(1);
					expect(res.body.message.attachments[0]).to.have.property('image_type', 'image/png');
					expect(res.body.message.attachments[0]).to.have.property('title', '1024x1024.png');
					expect(res.body.message).to.have.property('files');
					expect(res.body.message.files).to.be.an('array').of.length(2);
					expect(res.body.message.files[0]).to.have.property('type', 'image/png');
					expect(res.body.message.files[0]).to.have.property('name', '1024x1024.png');
					expect(res.body.message.attachments[0]).to.have.property('description', 'some_file_description');
				});
		});
	});

	describe('/rooms.media', () => {
		let testChannel;
		let user;
		let userCredentials;
		const testChannelName = `channel.test.upload.${Date.now()}-${Math.random()}`;
		let blockedMediaTypes;

		before(async () => {
			user = await createUser({ joinDefaultChannels: false });
			userCredentials = await login(user.username, password);
			testChannel = (await createRoom({ type: 'c', name: testChannelName })).body.channel;
			blockedMediaTypes = await getSettingValueById('FileUpload_MediaTypeBlackList');
			const newBlockedMediaTypes = blockedMediaTypes
				.split(',')
				.filter((type) => type !== 'image/svg+xml')
				.join(',');
			await updateSetting('FileUpload_MediaTypeBlackList', newBlockedMediaTypes);
		});

		after(() =>
			Promise.all([
				deleteRoom({ type: 'c', roomId: testChannel._id }),
				deleteUser(user),
				updateSetting('FileUpload_Restrict_to_room_members', true),
				updateSetting('FileUpload_ProtectFiles', true),
				updateSetting('FileUpload_MediaTypeBlackList', blockedMediaTypes),
			]),
		);

		it("don't upload a file to room with file field other than file", (done) => {
			request
				.post(api(`rooms.media/${testChannel._id}`))
				.set(credentials)
				.attach('test', imgURL)
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('error', '[invalid-field]');
					expect(res.body).to.have.property('errorType', 'invalid-field');
				})
				.end(done);
		});
		it("don't upload a file to room with empty file", (done) => {
			request
				.post(api(`rooms.media/${testChannel._id}`))
				.set(credentials)
				.attach('file', '')
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('error', res.body.error);
				})
				.end(done);
		});
		it("don't upload a file to room with more than 1 file", (done) => {
			request
				.post(api(`rooms.media/${testChannel._id}`))
				.set(credentials)
				.attach('file', imgURL)
				.attach('file', imgURL)
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('error', 'Just 1 file is allowed');
				})
				.end(done);
		});

		let fileNewUrl;
		let fileOldUrl;
		let fileId;
		it('should upload a PNG file to room', async () => {
			await request
				.post(api(`rooms.media/${testChannel._id}`))
				.set(credentials)
				.attach('file', imgURL)
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('file');
					expect(res.body.file).to.have.property('_id');
					expect(res.body.file).to.have.property('url');
					// expect(res.body.message.files[0]).to.have.property('type', 'image/png');
					// expect(res.body.message.files[0]).to.have.property('name', '1024x1024.png');

					fileNewUrl = res.body.file.url;
					fileOldUrl = res.body.file.url.replace('/file-upload/', '/ufs/GridFS:Uploads/');
					fileId = res.body.file._id;
				});

			await request
				.post(api(`rooms.mediaConfirm/${testChannel._id}/${fileId}`))
				.set(credentials)
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('message');
					expect(res.body.message).to.have.property('attachments');
					expect(res.body.message.attachments).to.be.an('array').of.length(1);
					expect(res.body.message.attachments[0]).to.have.property('image_type', 'image/png');
					expect(res.body.message.attachments[0]).to.have.property('title', '1024x1024.png');
					expect(res.body.message).to.have.property('files');
					expect(res.body.message.files).to.be.an('array').of.length(2);
					expect(res.body.message.files[0]).to.have.property('type', 'image/png');
					expect(res.body.message.files[0]).to.have.property('name', '1024x1024.png');
				});
		});

		it('should upload a LST file to room', async () => {
			let fileId;
			await request
				.post(api(`rooms.media/${testChannel._id}`))
				.set(credentials)
				.attach('file', lstURL)
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('file');
					expect(res.body.file).to.have.property('_id');
					expect(res.body.file).to.have.property('url');

					fileId = res.body.file._id;
				});

			await request
				.post(api(`rooms.mediaConfirm/${testChannel._id}/${fileId}`))
				.set(credentials)
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('message');
					expect(res.body.message).to.have.property('attachments');
					expect(res.body.message.attachments).to.be.an('array').of.length(1);
					expect(res.body.message.attachments[0]).to.have.property('format', 'LST');
					expect(res.body.message.attachments[0]).to.have.property('title', 'lst-test.lst');
					expect(res.body.message).to.have.property('files');
					expect(res.body.message.files).to.be.an('array').of.length(1);
					expect(res.body.message.files[0]).to.have.property('name', 'lst-test.lst');
				});
		});

		it('should not allow uploading a blocked media type to a room', async () => {
			await updateSetting('FileUpload_MediaTypeBlackList', 'text/plain');
			await request
				.post(api(`rooms.media/${testChannel._id}`))
				.set(credentials)
				.attach('file', lstURL)
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('errorType', 'error-invalid-file-type');
				});
		});

		it('should be able to get the file', async () => {
			await request.get(fileNewUrl).set(credentials).expect('Content-Type', 'image/png').expect(200);
			await request.get(fileOldUrl).set(credentials).expect('Content-Type', 'image/png').expect(200);
		});

		it('should be able to get the file when no access to the room if setting allows it', async () => {
			await updateSetting('FileUpload_Restrict_to_room_members', false);
			await request.get(fileNewUrl).set(userCredentials).expect('Content-Type', 'image/png').expect(200);
			await request.get(fileOldUrl).set(userCredentials).expect('Content-Type', 'image/png').expect(200);
		});

		it('should not be able to get the file when no access to the room if setting blocks', async () => {
			await updateSetting('FileUpload_Restrict_to_room_members', true);
			await request.get(fileNewUrl).set(userCredentials).expect(403);
			await request.get(fileOldUrl).set(userCredentials).expect(403);
		});

		it('should be able to get the file if member and setting blocks outside access', async () => {
			await updateSetting('FileUpload_Restrict_to_room_members', true);
			await request.get(fileNewUrl).set(credentials).expect('Content-Type', 'image/png').expect(200);
			await request.get(fileOldUrl).set(credentials).expect('Content-Type', 'image/png').expect(200);
		});

		it('should not be able to get the file without credentials', async () => {
			await request.get(fileNewUrl).attach('file', imgURL).expect(403);
			await request.get(fileOldUrl).attach('file', imgURL).expect(403);
		});

		it('should be able to get the file without credentials if setting allows', async () => {
			await updateSetting('FileUpload_ProtectFiles', false);
			await request.get(fileNewUrl).expect('Content-Type', 'image/png').expect(200);
			await request.get(fileOldUrl).expect('Content-Type', 'image/png').expect(200);
		});

		it('should generate thumbnail for SVG files correctly', async () => {
			const expectedFileName = `thumb-${svgLogoFileName}`;
			let thumbUrl;
			let fileId;
			await request
				.post(api(`rooms.media/${testChannel._id}`))
				.set(credentials)
				.attach('file', svgLogoURL)
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('file');
					expect(res.body.file).to.have.property('_id');
					expect(res.body.file).to.have.property('url');

					fileId = res.body.file._id;
				});

			await request
				.post(api(`rooms.mediaConfirm/${testChannel._id}/${fileId}`))
				.set(credentials)
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					const { message } = res.body;
					const { files, attachments } = message;

					expect(files).to.be.an('array');
					const hasThumbFile = files.some((file) => file.type === 'image/png' && file.name === expectedFileName);
					expect(hasThumbFile).to.be.true;

					expect(attachments).to.be.an('array');
					const thumbAttachment = attachments.find((attachment) => attachment.title === svgLogoFileName);
					expect(thumbAttachment).to.be.an('object');
					thumbUrl = thumbAttachment.image_url;
				});

			await request.get(thumbUrl).set(credentials).expect('Content-Type', 'image/png');
		});

		it('should generate thumbnail for JPEG files correctly', async () => {
			const expectedFileName = `thumb-sample-jpeg.jpg`;
			let thumbUrl;
			let fileId;
			await request
				.post(api(`rooms.media/${testChannel._id}`))
				.set(credentials)
				.attach('file', fs.createReadStream(path.join(__dirname, '../../mocks/files/sample-jpeg.jpg')))
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('file');
					expect(res.body.file).to.have.property('_id');
					expect(res.body.file).to.have.property('url');

					fileId = res.body.file._id;
				});

			await request
				.post(api(`rooms.mediaConfirm/${testChannel._id}/${fileId}`))
				.set(credentials)
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					const { message } = res.body;
					const { files, attachments } = message;

					expect(files).to.be.an('array');
					const hasThumbFile = files.some((file) => file.type === 'image/jpeg' && file.name === expectedFileName);
					expect(hasThumbFile).to.be.true;

					expect(attachments).to.be.an('array');
					const thumbAttachment = attachments.find((attachment) => attachment.title === `sample-jpeg.jpg`);
					expect(thumbAttachment).to.be.an('object');
					thumbUrl = thumbAttachment.image_url;
				});

			await request.get(thumbUrl).set(credentials).expect('Content-Type', 'image/jpeg');
		});

		// Support legacy behavior (not encrypting file)
		it('should correctly save file description and properties with type e2e', async () => {
			let fileId;
			await request
				.post(api(`rooms.media/${testChannel._id}`))
				.set(credentials)
				.attach('file', imgURL)
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('file');
					expect(res.body.file).to.have.property('_id');
					expect(res.body.file).to.have.property('url');

					fileId = res.body.file._id;
				});

			await request
				.post(api(`rooms.mediaConfirm/${testChannel._id}/${fileId}`))
				.set(credentials)
				.send({
					description: 'some_file_description',
				})
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('message');
					expect(res.body.message).to.have.property('attachments');
					expect(res.body.message.attachments).to.be.an('array').of.length(1);
					expect(res.body.message.attachments[0]).to.have.property('image_type', 'image/png');
					expect(res.body.message.attachments[0]).to.have.property('title', '1024x1024.png');
					expect(res.body.message).to.have.property('files');
					expect(res.body.message.files).to.be.an('array').of.length(2);
					expect(res.body.message.files[0]).to.have.property('type', 'image/png');
					expect(res.body.message.files[0]).to.have.property('name', '1024x1024.png');
					expect(res.body.message.attachments[0]).to.have.property('description', 'some_file_description');
				});
		});
	});

	describe('/rooms.favorite', () => {
		let testChannel;
		const testChannelName = `channel.test.${Date.now()}-${Math.random()}`;

		before(async () => {
			testChannel = (await createRoom({ type: 'c', name: testChannelName })).body.channel;
		});

		after(() => deleteRoom({ type: 'c', roomId: testChannel._id }));

		it('should favorite the room when send favorite: true by roomName', (done) => {
			request
				.post(api('rooms.favorite'))
				.set(credentials)
				.send({
					roomName: testChannelName,
					favorite: true,
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
				})
				.end(done);
		});
		it('should unfavorite the room when send favorite: false by roomName', (done) => {
			request
				.post(api('rooms.favorite'))
				.set(credentials)
				.send({
					roomName: testChannelName,
					favorite: false,
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
				})
				.end(done);
		});
		it('should favorite the room when send favorite: true by roomId', (done) => {
			request
				.post(api('rooms.favorite'))
				.set(credentials)
				.send({
					roomId: testChannel._id,
					favorite: true,
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
				})
				.end(done);
		});

		it('should unfavorite room when send favorite: false by roomId', (done) => {
			request
				.post(api('rooms.favorite'))
				.set(credentials)
				.send({
					roomId: testChannel._id,
					favorite: false,
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
				})
				.end(done);
		});

		it('should return an error when send an invalid room', (done) => {
			request
				.post(api('rooms.favorite'))
				.set(credentials)
				.send({
					roomId: 'foo',
					favorite: false,
				})
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('error');
				})
				.end(done);
		});
	});

	describe('/rooms.nameExists', () => {
		let testChannel;
		const testChannelName = `channel.test.${Date.now()}-${Math.random()}`;

		before(async () => {
			testChannel = (await createRoom({ type: 'c', name: testChannelName })).body.channel;
		});

		after(() => deleteRoom({ type: 'c', roomId: testChannel._id }));

		it('should return 401 unauthorized when user is not logged in', (done) => {
			request
				.get(api('rooms.nameExists'))
				.expect('Content-Type', 'application/json')
				.expect(401)
				.expect((res) => {
					expect(res.body).to.have.property('message');
				})
				.end(done);
		});

		it('should return true if this room name exists', (done) => {
			request
				.get(api('rooms.nameExists'))
				.set(credentials)
				.query({
					roomName: testChannelName,
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('exists', true);
				})
				.end(done);
		});

		it('should return an error when send an invalid room', (done) => {
			request
				.get(api('rooms.nameExists'))
				.set(credentials)
				.query({
					roomId: 'foo',
				})
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('error');
				})
				.end(done);
		});
	});

	describe('[/rooms.cleanHistory]', () => {
		let publicChannel;
		let privateChannel;
		let directMessageChannelId;
		let user;
		let userCredentials;

		beforeEach(async () => {
			user = await createUser();
			userCredentials = await login(user.username, password);
			await updateSetting('Message_ShowDeletedStatus', true);

			publicChannel = (await createRoom({ type: 'c', name: `testeChannel${+new Date()}` })).body.channel;
			privateChannel = (await createRoom({ type: 'p', name: `testPrivateChannel${+new Date()}` })).body.group;
			directMessageChannelId = (await createRoom({ type: 'd', username: 'rocket.cat' })).body.room.rid;
		});

		afterEach(() =>
			Promise.all([
				deleteUser(user),
				deleteRoom({ type: 'c', roomId: publicChannel._id }),
				deleteRoom({ type: 'p', roomId: privateChannel._id }),
				deleteRoom({ type: 'd', roomId: directMessageChannelId }),
			]),
		);

		after(() => updateSetting('Message_ShowDeletedStatus', false));

		it('should return success when send a valid public channel', (done) => {
			request
				.post(api('rooms.cleanHistory'))
				.set(credentials)
				.send({
					roomId: publicChannel._id,
					latest: '2016-12-09T13:42:25.304Z',
					oldest: '2016-08-30T13:42:25.304Z',
				})
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
				})
				.end(done);
		});
		it('should not count hidden or deleted messages when limit param is not sent', async () => {
			const res = await sendSimpleMessage({ roomId: publicChannel._id });
			await deleteMessage({ roomId: publicChannel._id, msgId: res.body.message._id });
			await request
				.post(api('rooms.cleanHistory'))
				.set(credentials)
				.send({
					roomId: publicChannel._id,
					latest: '9999-12-31T23:59:59.000Z',
					oldest: '0001-01-01T00:00:00.000Z',
				})
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('count', 0);
				});
		});
		it('should not count hidden or deleted messages when limit param is sent', async () => {
			const res = await sendSimpleMessage({ roomId: publicChannel._id });
			await deleteMessage({ roomId: publicChannel._id, msgId: res.body.message._id });
			await request
				.post(api('rooms.cleanHistory'))
				.set(credentials)
				.send({
					roomId: publicChannel._id,
					latest: '9999-12-31T23:59:59.000Z',
					oldest: '0001-01-01T00:00:00.000Z',
					limit: 2000,
				})
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('count', 0);
				});
		});
		it('should successfully delete an image and thumbnail from public channel', (done) => {
			request
				.post(api(`rooms.upload/${publicChannel._id}`))
				.set(credentials)
				.attach('file', imgURL)
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					const { message } = res.body;
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.nested.property('message._id', message._id);
					expect(res.body).to.have.nested.property('message.rid', publicChannel._id);
					expect(res.body).to.have.nested.property('message.file._id', message.file._id);
					expect(res.body).to.have.nested.property('message.file.type', message.file.type);
				});

			request
				.post(api('rooms.cleanHistory'))
				.set(credentials)
				.send({
					roomId: publicChannel._id,
					latest: '9999-12-31T23:59:59.000Z',
					oldest: '0001-01-01T00:00:00.000Z',
				})
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
				});

			request
				.get(api('channels.files'))
				.set(credentials)
				.query({
					roomId: publicChannel._id,
				})
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('files').and.to.be.an('array');
					expect(res.body.files).to.have.lengthOf(0);
				})
				.end(done);
		});
		it('should return success when send a valid private channel', (done) => {
			request
				.post(api('rooms.cleanHistory'))
				.set(credentials)
				.send({
					roomId: privateChannel._id,
					latest: '2016-12-09T13:42:25.304Z',
					oldest: '2016-08-30T13:42:25.304Z',
				})
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
				})
				.end(done);
		});
		it('should return success when send a valid Direct Message channel', (done) => {
			request
				.post(api('rooms.cleanHistory'))
				.set(credentials)
				.send({
					roomId: directMessageChannelId,
					latest: '2016-12-09T13:42:25.304Z',
					oldest: '2016-08-30T13:42:25.304Z',
				})
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
				})
				.end(done);
		});
		it('should return not allowed error when try deleting messages with user without permission', (done) => {
			request
				.post(api('rooms.cleanHistory'))
				.set(userCredentials)
				.send({
					roomId: directMessageChannelId,
					latest: '2016-12-09T13:42:25.304Z',
					oldest: '2016-08-30T13:42:25.304Z',
				})
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('errorType', 'error-not-allowed');
				})
				.end(done);
		});
	});

	describe('[/rooms.info]', () => {
		let testChannel;
		let testGroup;
		let testDM;
		const expectedKeys = [
			'_id',
			'name',
			'fname',
			't',
			'msgs',
			'usersCount',
			'u',
			'customFields',
			'ts',
			'ro',
			'sysMes',
			'default',
			'_updatedAt',
		];
		const testChannelName = `channel.test.${Date.now()}-${Math.random()}`;
		const testGroupName = `group.test.${Date.now()}-${Math.random()}`;

		before(async () => {
			testChannel = (await createRoom({ type: 'c', name: testChannelName })).body.channel;
			testGroup = (await createRoom({ type: 'p', name: testGroupName })).body.group;
			testDM = (await createRoom({ type: 'd', username: 'rocket.cat' })).body.room;
		});

		after(() =>
			Promise.all([
				deleteRoom({ type: 'd', roomId: testDM._id }),
				deleteRoom({ type: 'c', roomId: testChannel._id }),
				deleteRoom({ type: 'p', roomId: testGroup._id }),
			]),
		);

		it('should return the info about the created channel correctly searching by roomId', (done) => {
			request
				.get(api('rooms.info'))
				.set(credentials)
				.query({
					roomId: testChannel._id,
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('room').and.to.be.an('object');
					expect(res.body.room).to.have.keys(expectedKeys);
				})
				.end(done);
		});
		it('should return the info about the created channel correctly searching by roomName', (done) => {
			request
				.get(api('rooms.info'))
				.set(credentials)
				.query({
					roomName: testChannel.name,
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('room').and.to.be.an('object');
					expect(res.body.room).to.have.all.keys(expectedKeys);
				})
				.end(done);
		});
		it('should return the info about the created group correctly searching by roomId', (done) => {
			request
				.get(api('rooms.info'))
				.set(credentials)
				.query({
					roomId: testGroup._id,
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('room').and.to.be.an('object');
					expect(res.body.room).to.have.all.keys(expectedKeys);
				})
				.end(done);
		});
		it('should return the info about the created group correctly searching by roomName', (done) => {
			request
				.get(api('rooms.info'))
				.set(credentials)
				.query({
					roomName: testGroup.name,
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('room').and.to.be.an('object');
					expect(res.body.room).to.have.all.keys(expectedKeys);
				})
				.end(done);
		});
		it('should return the info about the created DM correctly searching by roomId', (done) => {
			request
				.get(api('rooms.info'))
				.set(credentials)
				.query({
					roomId: testDM._id,
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('room').and.to.be.an('object');
				})
				.end(done);
		});
		it('should return name and _id of public channel when it has the "fields" query parameter limiting by name', (done) => {
			request
				.get(api('rooms.info'))
				.set(credentials)
				.query({
					roomId: testChannel._id,
					fields: JSON.stringify({ name: 1 }),
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('room').and.to.be.an('object');
					expect(res.body.room).to.have.property('name').and.to.be.equal(testChannelName);
					expect(res.body.room).to.have.all.keys(['_id', 'name']);
				})
				.end(done);
		});
	});

	describe('[/rooms.leave]', () => {
		let testChannel;
		let testGroup;
		let testDM;
		let user2;
		let user2Credentials;
		const testChannelName = `channel.leave.${Date.now()}-${Math.random()}`;
		const testGroupName = `group.leave.${Date.now()}-${Math.random()}`;

		before(async () => {
			user2 = await createUser();
			user2Credentials = await login(user2.username, password);
			testChannel = (await createRoom({ type: 'c', name: testChannelName })).body.channel;
			testGroup = (await createRoom({ type: 'p', name: testGroupName })).body.group;
			testDM = (await createRoom({ type: 'd', username: user2.username })).body.room;
		});

		after(() =>
			Promise.all([
				deleteRoom({ type: 'd', roomId: testDM._id }),
				deleteRoom({ type: 'c', roomId: testChannel._id }),
				deleteRoom({ type: 'p', roomId: testGroup._id }),
				updatePermission('leave-c', ['admin', 'user', 'bot', 'anonymous', 'app']),
				updatePermission('leave-p', ['admin', 'user', 'bot', 'anonymous', 'app']),
				deleteUser(user2),
			]),
		);

		it('should return an Error when trying leave a DM room', (done) => {
			request
				.post(api('rooms.leave'))
				.set(credentials)
				.send({
					roomId: testDM._id,
				})
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('errorType', 'error-not-allowed');
				})
				.end(done);
		});
		it('should return an Error when trying to leave a public channel and you are the last owner', (done) => {
			request
				.post(api('rooms.leave'))
				.set(credentials)
				.send({
					roomId: testChannel._id,
				})
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('errorType', 'error-you-are-last-owner');
				})
				.end(done);
		});
		it('should return an Error when trying to leave a private group and you are the last owner', (done) => {
			request
				.post(api('rooms.leave'))
				.set(credentials)
				.send({
					roomId: testGroup._id,
				})
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('errorType', 'error-you-are-last-owner');
				})
				.end(done);
		});
		it('should return an Error when trying to leave a public channel and not have the necessary permission(leave-c)', (done) => {
			updatePermission('leave-c', []).then(() => {
				request
					.post(api('rooms.leave'))
					.set(credentials)
					.send({
						roomId: testChannel._id,
					})
					.expect(400)
					.expect((res) => {
						expect(res.body).to.have.property('success', false);
						expect(res.body).to.have.property('errorType', 'error-not-allowed');
					})
					.end(done);
			});
		});
		it('should return an Error when trying to leave a private group and not have the necessary permission(leave-p)', (done) => {
			updatePermission('leave-p', []).then(() => {
				request
					.post(api('rooms.leave'))
					.set(credentials)
					.send({
						roomId: testGroup._id,
					})
					.expect(400)
					.expect((res) => {
						expect(res.body).to.have.property('success', false);
						expect(res.body).to.have.property('errorType', 'error-not-allowed');
					})
					.end(done);
			});
		});
		it('should leave the public channel when the room has at least another owner and the user has the necessary permission(leave-c)', async () => {
			await updatePermission('leave-c', ['admin']);
			await request.post(api('channels.addAll')).set(credentials).send({
				roomId: testChannel._id,
			});

			await request.post(api('channels.addOwner')).set(credentials).send({
				roomId: testChannel._id,
				userId: user2._id,
			});

			await request
				.post(api('rooms.leave'))
				.set(credentials)
				.send({
					roomId: testChannel._id,
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
				});

			await request.post(api('channels.addOwner')).set(user2Credentials).send({
				roomId: testChannel._id,
				userId: credentials['X-User-Id'],
			});
		});
		it('should leave the private group when the room has at least another owner and the user has the necessary permission(leave-p)', async () => {
			await updatePermission('leave-p', ['user']);
			await request.post(api('groups.addAll')).set(credentials).send({
				roomId: testGroup._id,
			});
			await request.post(api('groups.addOwner')).set(credentials).send({
				roomId: testGroup._id,
				userId: user2._id,
			});
			await request
				.post(api('rooms.leave'))
				.set(user2Credentials)
				.send({
					roomId: testGroup._id,
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
				});
		});
	});

	describe('/rooms.createDiscussion', () => {
		let testChannel;
		const testChannelName = `channel.test.${Date.now()}-${Math.random()}`;
		let messageSent;
		let privateTeam;

		before(async () => {
			testChannel = (await createRoom({ type: 'c', name: testChannelName })).body.channel;
			messageSent = (
				await sendSimpleMessage({
					roomId: testChannel._id,
				})
			).body.message;
		});

		after(() =>
			Promise.all([
				deleteRoom({ type: 'c', roomId: testChannel._id }),
				updateSetting('Discussion_enabled', true),
				updatePermission('start-discussion', ['admin', 'user', 'guest', 'app']),
				updatePermission('start-discussion-other-user', ['admin', 'user', 'guest', 'app']),
				deleteTeam(credentials, privateTeam.name),
			]),
		);

		it('should throw an error when the user tries to create a discussion and the feature is disabled', (done) => {
			updateSetting('Discussion_enabled', false).then(() => {
				request
					.post(api('rooms.createDiscussion'))
					.set(credentials)
					.send({
						prid: testChannel._id,
						t_name: 'valid name',
					})
					.expect(400)
					.expect((res) => {
						expect(res.body).to.have.property('success', false);
						expect(res.body).to.have.property('errorType', 'error-action-not-allowed');
					})
					.end(() => updateSetting('Discussion_enabled', true).then(done));
			});
		});
		it('should throw an error when the user tries to create a discussion and does not have at least one of the required permissions', (done) => {
			updatePermission('start-discussion', []).then(() => {
				updatePermission('start-discussion-other-user', []).then(() => {
					request
						.post(api('rooms.createDiscussion'))
						.set(credentials)
						.send({
							prid: testChannel._id,
							t_name: 'valid name',
						})
						.expect(400)
						.expect((res) => {
							expect(res.body).to.have.property('success', false);
							expect(res.body).to.have.property('errorType', 'error-action-not-allowed');
						})
						.end(() => {
							updatePermission('start-discussion', ['admin', 'user', 'guest'])
								.then(() => updatePermission('start-discussion-other-user', ['admin', 'user', 'guest']))
								.then(done);
						});
				});
			});
		});
		it('should throw an error when the user tries to create a discussion without the required parameter "prid"', (done) => {
			request
				.post(api('rooms.createDiscussion'))
				.set(credentials)
				.send({})
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('error', 'Body parameter "prid" is required.');
				})
				.end(done);
		});
		it('should throw an error when the user tries to create a discussion without the required parameter "t_name"', (done) => {
			request
				.post(api('rooms.createDiscussion'))
				.set(credentials)
				.send({
					prid: testChannel._id,
				})
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('error', 'Body parameter "t_name" is required.');
				})
				.end(done);
		});
		it('should throw an error when the user tries to create a discussion with the required parameter invalid "users"(different from an array)', (done) => {
			request
				.post(api('rooms.createDiscussion'))
				.set(credentials)
				.send({
					prid: testChannel._id,
					t_name: 'valid name',
					users: 'invalid-type-of-users',
				})
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('error', 'Body parameter "users" must be an array.');
				})
				.end(done);
		});
		it("should throw an error when the user tries to create a discussion with the channel's id invalid", (done) => {
			request
				.post(api('rooms.createDiscussion'))
				.set(credentials)
				.send({
					prid: 'invalid-id',
					t_name: 'valid name',
				})
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('errorType', 'error-invalid-room');
				})
				.end(done);
		});
		it("should throw an error when the user tries to create a discussion with the message's id invalid", (done) => {
			request
				.post(api('rooms.createDiscussion'))
				.set(credentials)
				.send({
					prid: testChannel._id,
					t_name: 'valid name',
					pmid: 'invalid-message',
				})
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('errorType', 'error-invalid-message');
				})
				.end(done);
		});
		it('should create a discussion successfully when send only the required parameters', (done) => {
			request
				.post(api('rooms.createDiscussion'))
				.set(credentials)
				.send({
					prid: testChannel._id,
					t_name: `discussion-create-from-tests-${testChannel.name}`,
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('discussion').and.to.be.an('object');
					expect(res.body.discussion).to.have.property('prid').and.to.be.equal(testChannel._id);
					expect(res.body.discussion).to.have.property('fname').and.to.be.equal(`discussion-create-from-tests-${testChannel.name}`);
				})
				.end(done);
		});
		it('should create a discussion successfully when send the required parameters plus the optional parameter "reply"', (done) => {
			request
				.post(api('rooms.createDiscussion'))
				.set(credentials)
				.send({
					prid: testChannel._id,
					t_name: `discussion-create-from-tests-${testChannel.name}`,
					reply: 'reply from discussion tests',
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('discussion').and.to.be.an('object');
					expect(res.body.discussion).to.have.property('prid').and.to.be.equal(testChannel._id);
					expect(res.body.discussion).to.have.property('fname').and.to.be.equal(`discussion-create-from-tests-${testChannel.name}`);
				})
				.end(done);
		});
		it('should create a discussion successfully when send the required parameters plus the optional parameter "users"', (done) => {
			request
				.post(api('rooms.createDiscussion'))
				.set(credentials)
				.send({
					prid: testChannel._id,
					t_name: `discussion-create-from-tests-${testChannel.name}`,
					reply: 'reply from discussion tests',
					users: ['rocket.cat'],
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('discussion').and.to.be.an('object');
					expect(res.body.discussion).to.have.property('prid').and.to.be.equal(testChannel._id);
					expect(res.body.discussion).to.have.property('fname').and.to.be.equal(`discussion-create-from-tests-${testChannel.name}`);
				})
				.end(done);
		});
		it('should create a discussion successfully when send the required parameters plus the optional parameter "pmid"', (done) => {
			request
				.post(api('rooms.createDiscussion'))
				.set(credentials)
				.send({
					prid: testChannel._id,
					t_name: `discussion-create-from-tests-${testChannel.name}`,
					reply: 'reply from discussion tests',
					users: ['rocket.cat'],
					pmid: messageSent._id,
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('discussion').and.to.be.an('object');
					expect(res.body.discussion).to.have.property('prid').and.to.be.equal(testChannel._id);
					expect(res.body.discussion).to.have.property('fname').and.to.be.equal(`discussion-create-from-tests-${testChannel.name}`);
				})
				.end(done);
		});

		describe('it should create a *private* discussion if the parent channel is public and inside a private team', async () => {
			it('should create a team', (done) => {
				request
					.post(api('teams.create'))
					.set(credentials)
					.send({
						name: `test-team-${Date.now()}`,
						type: 1,
					})
					.expect('Content-Type', 'application/json')
					.expect(200)
					.expect((res) => {
						expect(res.body).to.have.property('success', true);
						expect(res.body).to.have.property('team');
						expect(res.body).to.have.nested.property('team._id');
						privateTeam = res.body.team;
					})
					.end(done);
			});

			it('should add the public channel to the team', (done) => {
				request
					.post(api('teams.addRooms'))
					.set(credentials)
					.send({
						rooms: [testChannel._id],
						teamId: privateTeam._id,
					})
					.expect('Content-Type', 'application/json')
					.expect(200)
					.expect((res) => {
						expect(res.body).to.have.property('success');
					})
					.end(done);
			});

			it('should create a private discussion inside the public channel', (done) => {
				request
					.post(api('rooms.createDiscussion'))
					.set(credentials)
					.send({
						prid: testChannel._id,
						t_name: `discussion-create-from-tests-${testChannel.name}-team`,
					})
					.expect(200)
					.expect((res) => {
						expect(res.body).to.have.property('success', true);
						expect(res.body).to.have.property('discussion').and.to.be.an('object');
						expect(res.body.discussion).to.have.property('prid').and.to.be.equal(testChannel._id);
						expect(res.body.discussion).to.have.property('fname').and.to.be.equal(`discussion-create-from-tests-${testChannel.name}-team`);
						expect(res.body.discussion).to.have.property('t').and.to.be.equal('p');
					})
					.end(done);
			});
		});
	});

	describe('/rooms.getDiscussions', () => {
		let testChannel;
		const testChannelName = `channel.test.getDiscussions${Date.now()}-${Math.random()}`;

		before(async () => {
			testChannel = (await createRoom({ type: 'c', name: testChannelName })).body.channel;
			await request
				.post(api('rooms.createDiscussion'))
				.set(credentials)
				.send({
					prid: testChannel._id,
					t_name: `discussion-create-from-tests-${testChannel.name}`,
				});
		});

		after(() =>
			Promise.all([
				deleteRoom({ type: 'c', roomId: testChannel._id }),
				updatePermission('view-c-room', ['admin', 'user', 'bot', 'app', 'anonymous']),
			]),
		);

		it('should throw an error when the user tries to gets a list of discussion without a required parameter "roomId"', (done) => {
			request
				.get(api('rooms.getDiscussions'))
				.set(credentials)
				.query({})
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('error', 'The parameter "roomId" or "roomName" is required [error-roomid-param-not-provided]');
				})
				.end(done);
		});
		it('should throw an error when the user tries to gets a list of discussion and he cannot access the room', (done) => {
			updatePermission('view-c-room', []).then(() => {
				request
					.get(api('rooms.getDiscussions'))
					.set(credentials)
					.query({})
					.expect(400)
					.expect((res) => {
						expect(res.body).to.have.property('success', false);
						expect(res.body).to.have.property('error', 'Not Allowed');
					})
					.end(() => updatePermission('view-c-room', ['admin', 'user', 'bot', 'anonymous']).then(done));
			});
		});
		it('should return a list of discussions with ONE discussion', (done) => {
			request
				.get(api('rooms.getDiscussions'))
				.set(credentials)
				.query({
					roomId: testChannel._id,
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('discussions').and.to.be.an('array');
					expect(res.body.discussions).to.have.lengthOf(1);
				})
				.end(done);
		});
	});

	describe('[/rooms.autocomplete.channelAndPrivate]', () => {
		it('should return an error when the required parameter "selector" is not provided', (done) => {
			request
				.get(api('rooms.autocomplete.channelAndPrivate'))
				.set(credentials)
				.query({})
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body.error).to.be.equal("The 'selector' param is required");
				})
				.end(done);
		});
		it('should return the rooms to fill auto complete', (done) => {
			request
				.get(api('rooms.autocomplete.channelAndPrivate?selector={}'))
				.set(credentials)
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('items').and.to.be.an('array');
				})
				.end(done);
		});
	});

	describe('[/rooms.autocomplete.channelAndPrivate.withPagination]', () => {
		it('should return an error when the required parameter "selector" is not provided', (done) => {
			request
				.get(api('rooms.autocomplete.channelAndPrivate.withPagination'))
				.set(credentials)
				.query({})
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body.error).to.be.equal("The 'selector' param is required");
				})
				.end(done);
		});
		it('should return the rooms to fill auto complete', (done) => {
			request
				.get(api('rooms.autocomplete.channelAndPrivate.withPagination?selector={}'))
				.set(credentials)
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('items').and.to.be.an('array');
					expect(res.body).to.have.property('total');
				})
				.end(done);
		});
		it('should return the rooms to fill auto complete even requested with count and offset params', (done) => {
			request
				.get(api('rooms.autocomplete.channelAndPrivate.withPagination?selector={}'))
				.set(credentials)
				.query({
					count: 5,
					offset: 0,
				})
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('items').and.to.be.an('array');
					expect(res.body).to.have.property('total');
				})
				.end(done);
		});
	});

	describe('[/rooms.autocomplete.availableForTeams]', () => {
		it('should return the rooms to fill auto complete', (done) => {
			request
				.get(api('rooms.autocomplete.availableForTeams'))
				.set(credentials)
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('items').and.to.be.an('array');
				})
				.end(done);
		});
		it('should return the filtered rooms to fill auto complete', (done) => {
			request
				.get(api('rooms.autocomplete.availableForTeams?name=group'))
				.set(credentials)
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('items').and.to.be.an('array');
				})
				.end(done);
		});
	});

	describe('[/rooms.autocomplete.adminRooms]', () => {
		let testGroup;
		const testGroupName = `channel.test.adminRoom${Date.now()}-${Math.random()}`;
		const name = {
			name: testGroupName,
		};

		before(async () => {
			testGroup = (await createRoom({ type: 'p', name: testGroupName })).body.group;
			await request
				.post(api('rooms.createDiscussion'))
				.set(credentials)
				.send({
					prid: testGroup._id,
					t_name: `${testGroupName}-discussion`,
				});
		});

		after(() => Promise.all([deleteRoom({ type: 'p', roomId: testGroup._id }), updateEEPermission('can-audit', ['admin', 'auditor'])]));

		(IS_EE ? it : it.skip)('should return an error when the required parameter "selector" is not provided', (done) => {
			updateEEPermission('can-audit', ['admin']).then(() => {
				request
					.get(api('rooms.autocomplete.adminRooms'))
					.set(credentials)
					.query({})
					.expect('Content-Type', 'application/json')
					.expect(400)
					.expect((res) => {
						expect(res.body).to.have.property('success', false);
						expect(res.body.error).to.be.equal("The 'selector' param is required");
					})
					.end(done);
			});
		});
		it('should return the rooms to fill auto complete', (done) => {
			request
				.get(api('rooms.autocomplete.adminRooms?selector={}'))
				.set(credentials)
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('items').and.to.be.an('array');
				})
				.end(done);
		});
		it('should return the rooms to fill auto complete', (done) => {
			request
				.get(api('rooms.autocomplete.adminRooms?'))
				.set(credentials)
				.query({
					selector: JSON.stringify(name),
				})
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('items').and.to.be.an('array');
					expect(res.body).to.have.property('items').that.have.lengthOf(2);
				})
				.end(done);
		});
	});

	describe('/rooms.adminRooms', () => {
		const suffix = `test-${Date.now()}`;
		const fnameRoom = `Ελληνικά-${suffix}`;
		const nameRoom = `Ellinika-${suffix}`;
		const discussionRoomName = `${nameRoom}-discussion`;

		let testGroup;

		before(async () => {
			await updateSetting('UI_Allow_room_names_with_special_chars', true);
			testGroup = (await createRoom({ type: 'p', name: fnameRoom })).body.group;
			await request.post(api('rooms.createDiscussion')).set(credentials).send({
				prid: testGroup._id,
				t_name: discussionRoomName,
			});
		});

		after(() =>
			Promise.all([
				updateSetting('UI_Allow_room_names_with_special_chars', false),
				deleteRoom({ type: 'p', roomId: testGroup._id }),
				updatePermission('view-room-administration', ['admin']),
			]),
		);

		it('should throw an error when the user tries to gets a list of discussion and he cannot access the room', (done) => {
			updatePermission('view-room-administration', []).then(() => {
				request
					.get(api('rooms.adminRooms'))
					.set(credentials)
					.expect(400)
					.expect((res) => {
						expect(res.body).to.have.property('success', false);
						expect(res.body.error).to.be.equal('error-not-authorized');
					})
					.end(() => updatePermission('view-room-administration', ['admin']).then(done));
			});
		});
		it('should return a list of admin rooms', (done) => {
			request
				.get(api('rooms.adminRooms'))
				.set(credentials)
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('rooms').and.to.be.an('array');
					expect(res.body).to.have.property('offset');
					expect(res.body).to.have.property('total');
					expect(res.body).to.have.property('count');
				})
				.end(done);
		});
		it('should return a list of admin rooms even requested with count and offset params', (done) => {
			request
				.get(api('rooms.adminRooms'))
				.set(credentials)
				.query({
					count: 5,
					offset: 0,
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('rooms').and.to.be.an('array');
					expect(res.body).to.have.property('offset');
					expect(res.body).to.have.property('total');
					expect(res.body).to.have.property('count');
				})
				.end(done);
		});
		it('should search the list of admin rooms using non-latin characters when UI_Allow_room_names_with_special_chars setting is toggled', (done) => {
			updateSetting('UI_Allow_room_names_with_special_chars', true).then(() => {
				request
					.get(api('rooms.adminRooms'))
					.set(credentials)
					.query({
						filter: fnameRoom,
					})
					.expect(200)
					.expect((res) => {
						expect(res.body).to.have.property('success', true);
						expect(res.body).to.have.property('rooms').and.to.be.an('array');
						expect(res.body.rooms).to.have.lengthOf(1);
						expect(res.body.rooms[0].fname).to.be.equal(fnameRoom);
						expect(res.body).to.have.property('offset');
						expect(res.body).to.have.property('total');
						expect(res.body).to.have.property('count');
					})
					.end(done);
			});
		});
		it('should search the list of admin rooms using latin characters only when UI_Allow_room_names_with_special_chars setting is disabled', (done) => {
			updateSetting('UI_Allow_room_names_with_special_chars', false).then(() => {
				request
					.get(api('rooms.adminRooms'))
					.set(credentials)
					.query({
						filter: nameRoom,
					})
					.expect(200)
					.expect((res) => {
						expect(res.body).to.have.property('success', true);
						expect(res.body).to.have.property('rooms').and.to.be.an('array');
						expect(res.body.rooms).to.have.lengthOf(1);
						expect(res.body.rooms[0].name).to.be.equal(nameRoom);
						expect(res.body).to.have.property('offset');
						expect(res.body).to.have.property('total');
						expect(res.body).to.have.property('count');
					})
					.end(done);
			});
		});
		it('should filter by only rooms types', (done) => {
			request
				.get(api('rooms.adminRooms'))
				.set(credentials)
				.query({
					types: ['p'],
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('rooms').and.to.be.an('array');
					expect(res.body.rooms).to.have.lengthOf.at.least(1);
					expect(res.body.rooms[0].t).to.be.equal('p');
					expect(res.body.rooms.find((room) => room.name === nameRoom)).to.exist;
					expect(res.body.rooms.find((room) => room.name === discussionRoomName)).to.not.exist;
				})
				.end(done);
		});
		it('should filter by only name', (done) => {
			request
				.get(api('rooms.adminRooms'))
				.set(credentials)
				.query({
					filter: nameRoom,
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('rooms').and.to.be.an('array');
					expect(res.body.rooms).to.have.lengthOf(1);
					expect(res.body.rooms[0].name).to.be.equal(nameRoom);
				})
				.end(done);
		});
		it('should filter by type and name at the same query', (done) => {
			request
				.get(api('rooms.adminRooms'))
				.set(credentials)
				.query({
					filter: nameRoom,
					types: ['p'],
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('rooms').and.to.be.an('array');
					expect(res.body.rooms).to.have.lengthOf(1);
					expect(res.body.rooms[0].name).to.be.equal(nameRoom);
				})
				.end(done);
		});
		it('should return an empty array when filter by wrong type and correct room name', (done) => {
			request
				.get(api('rooms.adminRooms'))
				.set(credentials)
				.query({
					filter: nameRoom,
					types: ['c'],
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('rooms').and.to.be.an('array');
					expect(res.body.rooms).to.have.lengthOf(0);
				})
				.end(done);
		});
	});

	describe('update group dms name', () => {
		let testUser;
		let roomId;

		before(async () => {
			testUser = await createUser();

			const rocketcat = 'rocket.cat';
			const usernames = [testUser.username, rocketcat].join(',');

			const result = await request.post(api('dm.create')).set(credentials).send({
				usernames,
			});

			roomId = result.body.room.rid;
		});

		after(async () => Promise.all([updateSetting('UI_Use_Real_Name', false), deleteRoom({ type: 'd', roomId }), deleteUser(testUser)]));

		it('should update group name if user changes username', async () => {
			await updateSetting('UI_Use_Real_Name', false);
			await request
				.post(api('users.update'))
				.set(credentials)
				.send({
					userId: testUser._id,
					data: {
						username: `changed.username.${testUser.username}`,
					},
				});

			// need to wait for the username update finish
			await sleep(300);

			await request
				.get(api('subscriptions.getOne'))
				.set(credentials)
				.query({ roomId })
				.send()
				.expect((res) => {
					const { subscription } = res.body;
					expect(subscription.name).to.equal(`rocket.cat,changed.username.${testUser.username}`);
				});
		});

		it('should update group name if user changes name', async () => {
			await updateSetting('UI_Use_Real_Name', true);
			await request
				.post(api('users.update'))
				.set(credentials)
				.send({
					userId: testUser._id,
					data: {
						name: `changed.name.${testUser.username}`,
					},
				});

			// need to wait for the name update finish
			await sleep(300);

			await request
				.get(api('subscriptions.getOne'))
				.set(credentials)
				.query({ roomId })
				.send()
				.expect((res) => {
					const { subscription } = res.body;
					expect(subscription.fname).to.equal(`changed.name.${testUser.username}, Rocket.Cat`);
				});
		});
	});

	describe('/rooms.delete', () => {
		let testChannel;

		before('create an channel', async () => {
			const result = await createRoom({ type: 'c', name: `channel.test.${Date.now()}-${Math.random()}` });
			testChannel = result.body.channel;
		});

		after(() => deleteRoom({ type: 'c', roomId: testChannel._id }));

		it('should throw an error when roomId is not provided', (done) => {
			request
				.post(api('rooms.delete'))
				.set(credentials)
				.send({})
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('error', "The 'roomId' param is required");
				})
				.end(done);
		});
		it('should delete a room when the request is correct', (done) => {
			request
				.post(api('rooms.delete'))
				.set(credentials)
				.send({ roomId: testChannel._id })
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
				})
				.end(done);
		});
		it('should throw an error when the room id doesn exist', (done) => {
			request
				.post(api('rooms.delete'))
				.set(credentials)
				.send({ roomId: 'invalid' })
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
				})
				.end(done);
		});
	});

	describe('rooms.saveRoomSettings', () => {
		let testChannel;
		const randomString = `randomString${Date.now()}`;
		let discussion;

		before(async () => {
			const result = await createRoom({ type: 'c', name: `channel.test.${Date.now()}-${Math.random()}` });
			testChannel = result.body.channel;

			const resDiscussion = await request
				.post(api('rooms.createDiscussion'))
				.set(credentials)
				.send({
					prid: testChannel._id,
					t_name: `discussion-create-from-tests-${testChannel.name}`,
				});

			discussion = resDiscussion.body.discussion;
		});

		after(() => Promise.all([deleteRoom({ type: 'p', roomId: discussion._id }), deleteRoom({ type: 'p', roomId: testChannel._id })]));

		it('should update the room settings', (done) => {
			const imageDataUri = `data:image/png;base64,${fs.readFileSync(path.join(process.cwd(), imgURL)).toString('base64')}`;

			request
				.post(api('rooms.saveRoomSettings'))
				.set(credentials)
				.send({
					rid: testChannel._id,
					roomAvatar: imageDataUri,
					featured: true,
					roomName: randomString,
					roomTopic: randomString,
					roomAnnouncement: randomString,
					roomDescription: randomString,
					roomType: 'p',
					readOnly: true,
					reactWhenReadOnly: true,
					default: true,
					favorite: {
						favorite: true,
						defaultValue: true,
					},
				})
				.expect('Content-Type', 'application/json')
				.expect(200)
				.end(done);
		});

		it('should have reflected on rooms.info', (done) => {
			request
				.get(api('rooms.info'))
				.set(credentials)
				.query({
					roomId: testChannel._id,
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('room').and.to.be.an('object');

					expect(res.body.room).to.have.property('_id', testChannel._id);
					expect(res.body.room).to.have.property('name', randomString);
					expect(res.body.room).to.have.property('topic', randomString);
					expect(res.body.room).to.have.property('announcement', randomString);
					expect(res.body.room).to.have.property('description', randomString);
					expect(res.body.room).to.have.property('t', 'p');
					expect(res.body.room).to.have.property('featured', true);
					expect(res.body.room).to.have.property('ro', true);
					expect(res.body.room).to.have.property('default', true);
					expect(res.body.room).to.have.property('favorite', true);
					expect(res.body.room).to.have.property('reactWhenReadOnly', true);
				})
				.end(done);
		});

		it('should be able to update the discussion name with spaces', async () => {
			const newDiscussionName = `${randomString} with spaces`;

			await request
				.post(api('rooms.saveRoomSettings'))
				.set(credentials)
				.send({
					rid: discussion._id,
					roomName: newDiscussionName,
				})
				.expect('Content-Type', 'application/json')
				.expect(200);

			await request
				.get(api('rooms.info'))
				.set(credentials)
				.query({
					roomId: discussion._id,
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('room').and.to.be.an('object');

					expect(res.body.room).to.have.property('_id', discussion._id);
					expect(res.body.room).to.have.property('fname', newDiscussionName);
				});
		});

		it('should mark a room as favorite', async () => {
			await request
				.post(api('rooms.saveRoomSettings'))
				.set(credentials)
				.send({
					rid: testChannel._id,
					favorite: {
						favorite: true,
						defaultValue: true,
					},
				})
				.expect('Content-Type', 'application/json')
				.expect(200);

			await request
				.get(api('rooms.info'))
				.set(credentials)
				.query({
					roomId: testChannel._id,
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('room').and.to.be.an('object');

					expect(res.body.room).to.have.property('_id', testChannel._id);
					expect(res.body.room).to.have.property('favorite', true);
				});
		});
		it('should not mark a room as favorite when room is not a default room', async () => {
			await request
				.post(api('rooms.saveRoomSettings'))
				.set(credentials)
				.send({
					rid: testChannel._id,
					favorite: {
						favorite: true,
						defaultValue: false,
					},
				})
				.expect('Content-Type', 'application/json')
				.expect(200);

			await request
				.get(api('rooms.info'))
				.set(credentials)
				.query({
					roomId: testChannel._id,
				})
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('room').and.to.be.an('object');

					expect(res.body.room).to.have.property('_id', testChannel._id);
					expect(res.body.room).to.not.have.property('favorite');
				});
		});
	});

	describe('rooms.images', () => {
		let testUserCreds = null;
		before(async () => {
			const user = await createUser();
			testUserCreds = await login(user.username, password);
		});

		const uploadFile = async ({ roomId, file }) => {
			const { body } = await request
				.post(api(`rooms.upload/${roomId}`))
				.set(credentials)
				.attach('file', file)
				.expect('Content-Type', 'application/json')
				.expect(200);

			return body.message.attachments[0];
		};

		const getIdFromImgPath = (link) => {
			return link.split('/')[2];
		};

		it('should return an error when user is not logged in', async () => {
			await request.get(api('rooms.images')).expect(401);
		});
		it('should return an error when the required parameter "roomId" is not provided', async () => {
			await request.get(api('rooms.images')).set(credentials).expect(400);
		});
		it('should return an error when the required parameter "roomId" is not a valid room', async () => {
			await request.get(api('rooms.images')).set(credentials).query({ roomId: 'invalid' }).expect(403);
		});
		it('should return an error when room is valid but user is not part of it', async () => {
			const { body } = await createRoom({ type: 'p', name: `test-${Date.now()}` });

			const {
				group: { _id: roomId },
			} = body;
			await request.get(api('rooms.images')).set(testUserCreds).query({ roomId }).expect(403);

			await deleteRoom({ type: 'p', roomId });
		});
		it('should return an empty array when room is valid and user is part of it but there are no images', async () => {
			const { body } = await createRoom({ type: 'p', usernames: [credentials.username], name: `test-${Date.now()}` });
			const {
				group: { _id: roomId },
			} = body;
			await request
				.get(api('rooms.images'))
				.set(credentials)
				.query({ roomId })
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('files').and.to.be.an('array').and.to.have.lengthOf(0);
				});

			await deleteRoom({ type: 'p', roomId });
		});
		it('should return an array of images when room is valid and user is part of it and there are images', async () => {
			const { body } = await createRoom({ type: 'p', usernames: [credentials.username], name: `test-${Date.now()}` });
			const {
				group: { _id: roomId },
			} = body;
			const { title_link } = await uploadFile({
				roomId,
				file: fs.createReadStream(path.join(process.cwd(), imgURL)),
			});
			const fileId = getIdFromImgPath(title_link);
			await request
				.get(api('rooms.images'))
				.set(credentials)
				.query({ roomId })
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('files').and.to.be.an('array').and.to.have.lengthOf(1);
					expect(res.body.files[0]).to.have.property('_id', fileId);
				});

			await deleteRoom({ type: 'p', roomId });
		});
		it('should return multiple images when room is valid and user is part of it and there are multiple images', async () => {
			const { body } = await createRoom({ type: 'p', usernames: [credentials.username], name: `test-${Date.now()}` });
			const {
				group: { _id: roomId },
			} = body;
			const { title_link: link1 } = await uploadFile({
				roomId,
				file: fs.createReadStream(path.join(process.cwd(), imgURL)),
			});
			const { title_link: link2 } = await uploadFile({
				roomId,
				file: fs.createReadStream(path.join(process.cwd(), imgURL)),
			});

			const fileId1 = getIdFromImgPath(link1);
			const fileId2 = getIdFromImgPath(link2);

			await request
				.get(api('rooms.images'))
				.set(credentials)
				.query({ roomId })
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('files').and.to.be.an('array').and.to.have.lengthOf(2);
					expect(res.body.files.find((file) => file._id === fileId1)).to.exist;
					expect(res.body.files.find((file) => file._id === fileId2)).to.exist;
				});

			await deleteRoom({ type: 'p', roomId });
		});
		it('should allow to filter images passing the startingFromId parameter', async () => {
			const { body } = await createRoom({ type: 'p', usernames: [credentials.username], name: `test-${Date.now()}` });
			const {
				group: { _id: roomId },
			} = body;
			const { title_link } = await uploadFile({
				roomId,
				file: fs.createReadStream(path.join(process.cwd(), imgURL)),
			});
			await uploadFile({
				roomId,
				file: fs.createReadStream(path.join(process.cwd(), imgURL)),
			});

			const fileId2 = getIdFromImgPath(title_link);
			await request
				.get(api('rooms.images'))
				.set(credentials)
				.query({ roomId, startingFromId: fileId2 })
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('files').and.to.be.an('array').and.to.have.lengthOf(1);
					expect(res.body.files[0]).to.have.property('_id', fileId2);
				});

			await deleteRoom({ type: 'p', roomId });
		});
	});

	describe('/rooms.muteUser', () => {
		let testChannel;

		before('create a channel', async () => {
			const result = await createRoom({ type: 'c', name: `channel.test.${Date.now()}-${Math.random()}` });
			testChannel = result.body.channel;
		});

		after(async () => {
			await deleteRoom({ type: 'c', roomId: testChannel._id });
		});

		it('should invite rocket.cat user to room', () => {
			return request
				.post(api('channels.invite'))
				.set(credentials)
				.send({
					roomId: testChannel._id,
					username: 'rocket.cat',
				})
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.nested.property('channel.name', testChannel.name);
				});
		});

		it('should mute the rocket.cat user', () => {
			return request
				.post(api('rooms.muteUser'))
				.set(credentials)
				.send({
					roomId: testChannel._id,
					username: 'rocket.cat',
				})
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
				});
		});

		it('should contain rocket.cat user in mute list', () => {
			return request
				.get(api('channels.info'))
				.set(credentials)
				.query({
					roomId: testChannel._id,
				})
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.nested.property('channel.name', testChannel.name);
					expect(res.body.channel).to.have.property('muted').and.to.be.an('array');
					expect(res.body.channel.muted).to.have.lengthOf(1);
					expect(res.body.channel.muted[0]).to.be.equal('rocket.cat');
				});
		});
	});

	describe('/rooms.unmuteUser', () => {
		let testChannel;

		before('create a channel', async () => {
			const result = await createRoom({ type: 'c', name: `channel.test.${Date.now()}-${Math.random()}` });
			testChannel = result.body.channel;

			await request
				.post(api('rooms.saveRoomSettings'))
				.set(credentials)
				.send({
					rid: testChannel._id,
					readOnly: true,
				})
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
				});

			await request
				.post(api('channels.invite'))
				.set(credentials)
				.send({
					roomId: testChannel._id,
					username: 'rocket.cat',
				})
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.nested.property('channel.name', testChannel.name);
				});
		});

		after(async () => {
			await deleteRoom({ type: 'c', roomId: testChannel._id });
		});

		it('should unmute the rocket.cat user in read-only room', () => {
			return request
				.post(api('rooms.unmuteUser'))
				.set(credentials)
				.send({
					roomId: testChannel._id,
					username: 'rocket.cat',
				})
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
				});
		});

		it('should contain rocket.cat user in unmute list', () => {
			return request
				.get(api('channels.info'))
				.set(credentials)
				.query({
					roomId: testChannel._id,
				})
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.nested.property('channel.name', testChannel.name);
					expect(res.body.channel).to.have.property('unmuted').and.to.be.an('array');
					expect(res.body.channel.unmuted).to.have.lengthOf(1);
					expect(res.body.channel.unmuted[0]).to.be.equal('rocket.cat');
				});
		});
	});

	describe('/rooms.export', () => {
		let testChannel;
		let testMessageId;

		before(async () => {
			const result = await createRoom({ type: 'c', name: `channel.export.test.${Date.now()}-${Math.random()}` });
			testChannel = result.body.channel;
			const { body: { message } = {} } = await sendSimpleMessage({
				roomId: testChannel._id,
				text: 'Message to create thread',
			});
			testMessageId = message._id;
		});

		after(() => deleteRoom({ type: 'c', roomId: testChannel._id }));

		it('should fail exporting room as file if dates are incorrectly provided', async () => {
			return request
				.post(api('rooms.export'))
				.set(credentials)
				.send({
					rid: testChannel._id,
					type: 'file',
					dateFrom: 'test-date',
					dateTo: 'test-date',
					format: 'html',
				})
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('errorType', 'invalid-params');
				});
		});

		it('should fail exporting room as file if no roomId is provided', async () => {
			return request
				.post(api('rooms.export'))
				.set(credentials)
				.send({
					type: 'file',
					dateFrom: '2024-03-15',
					dateTo: '2024-03-22',
					format: 'html',
				})
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('errorType', 'invalid-params');
					expect(res.body).to.have.property('error').include("must have required property 'rid'");
				});
		});

		it('should fail exporting room as file if no type is provided', async () => {
			return request
				.post(api('rooms.export'))
				.set(credentials)
				.send({
					rid: testChannel._id,
					dateFrom: '2024-03-15',
					dateTo: '2024-03-22',
					format: 'html',
				})
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('errorType', 'invalid-params');
					expect(res.body).to.have.property('error').include("must have required property 'type'");
				});
		});

		it('should fail exporting room as file if fromDate is after toDate (incorrect date interval)', async () => {
			return request
				.post(api('rooms.export'))
				.set(credentials)
				.send({
					rid: testChannel._id,
					type: 'file',
					dateFrom: '2024-03-22',
					dateTo: '2024-03-15',
					format: 'html',
				})
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('errorType', 'error-invalid-dates');
					expect(res.body).to.have.property('error', 'From date cannot be after To date [error-invalid-dates]');
				});
		});

		it('should fail exporting room as file if invalid roomId is provided', async () => {
			return request
				.post(api('rooms.export'))
				.set(credentials)
				.send({
					rid: 'invalid-rid',
					type: 'file',
					dateFrom: '2024-03-22',
					dateTo: '2024-03-15',
					format: 'html',
				})
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('errorType', 'error-invalid-room');
				});
		});

		it('should fail exporting room as file if no format is provided', async () => {
			return request
				.post(api('rooms.export'))
				.set(credentials)
				.send({
					rid: testChannel._id,
					type: 'file',
					dateFrom: '2024-03-15',
					dateTo: '2024-03-22',
				})
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('errorType', 'invalid-params');
				});
		});

		it('should fail exporting room as file if an invalid format is provided', async () => {
			return request
				.post(api('rooms.export'))
				.set(credentials)
				.send({
					rid: testChannel._id,
					type: 'file',
					dateFrom: '2024-03-15',
					dateTo: '2024-03-22',
					format: 'invalid-format',
				})
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('errorType', 'invalid-params');
				});
		});

		it('should fail exporting room as file if an invalid type is provided', async () => {
			return request
				.post(api('rooms.export'))
				.set(credentials)
				.send({
					rid: testChannel._id,
					type: 'invalid-type',
					dateFrom: '2024-03-15',
					dateTo: '2024-03-22',
					format: 'html',
				})
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('errorType', 'invalid-params');
				});
		});

		it('should succesfully export room as file', async () => {
			return request
				.post(api('rooms.export'))
				.set(credentials)
				.send({
					rid: testChannel._id,
					type: 'file',
					dateFrom: '2024-03-15',
					dateTo: '2024-03-22',
					format: 'html',
				})
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
				});
		});

		it('should succesfully export room as file even if no dates are provided', async () => {
			return request
				.post(api('rooms.export'))
				.set(credentials)
				.send({
					rid: testChannel._id,
					type: 'file',
					format: 'html',
				})
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
				});
		});

		it('should fail exporting room via email if target users AND target emails are NOT provided', async () => {
			return request
				.post(api('rooms.export'))
				.set(credentials)
				.send({
					rid: testChannel._id,
					type: 'email',
					toUsers: [],
					subject: 'Test Subject',
					messages: [testMessageId],
				})
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('errorType', 'error-invalid-recipient');
				});
		});

		it('should fail exporting room via email if no target e-mails are provided', async () => {
			return request
				.post(api('rooms.export'))
				.set(credentials)
				.send({
					rid: testChannel._id,
					type: 'email',
					toEmails: [],
					subject: 'Test Subject',
					messages: [testMessageId],
				})
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('errorType', 'error-invalid-recipient');
				});
		});

		it('should fail exporting room via email if no target users or e-mails params are provided', async () => {
			return request
				.post(api('rooms.export'))
				.set(credentials)
				.send({
					rid: testChannel._id,
					type: 'email',
					subject: 'Test Subject',
					messages: [testMessageId],
				})
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('errorType', 'error-invalid-recipient');
				});
		});

		it('should fail exporting room via email if no messages are provided', async () => {
			return request
				.post(api('rooms.export'))
				.set(credentials)
				.send({
					rid: testChannel._id,
					type: 'email',
					toUsers: [credentials['X-User-Id']],
					subject: 'Test Subject',
					messages: [],
				})
				.expect('Content-Type', 'application/json')
				.expect(400)
				.expect((res) => {
					expect(res.body).to.have.property('success', false);
					expect(res.body).to.have.property('errorType', 'invalid-params');
				});
		});

		it('should succesfully export room via email', async () => {
			return request
				.post(api('rooms.export'))
				.set(credentials)
				.send({
					rid: testChannel._id,
					type: 'email',
					toUsers: [credentials['X-User-Id']],
					subject: 'Test Subject',
					messages: [testMessageId],
				})
				.expect('Content-Type', 'application/json')
				.expect(200)
				.expect((res) => {
					expect(res.body).to.have.property('success', true);
					expect(res.body).to.have.property('missing');
					expect(res.body.missing).to.be.an('array').that.is.empty;
				});
		});
	});
});
