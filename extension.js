const vscode = require('vscode');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const marked = require('marked');
const crypto = require('crypto');
const algorithm = 'aes-256-cbc';
const secretKey = vscode.workspace.getConfiguration().get('code2ghost.secretKey');
const iv = crypto.randomBytes(16);


/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	const set_config = vscode.commands.registerCommand('code2ghost.setConfig', async function () {
		vscode.window.showInformationMessage('Setting Config...');
		const url = await vscode.window.showInputBox({ prompt: 'Enter API URL' });
		const key = await vscode.window.showInputBox({ prompt: 'Enter Admin API key' });
		setConfig(context, url, key);
	});

	const get_config = vscode.commands.registerCommand('code2ghost.getConfig', function () {
		const { bareUrl, key } = getConfig(context);
		vscode.window.showInformationMessage(`URL: ${bareUrl}, Key: ${key}`);
	});

	const create_post_current_editor_draft = vscode.commands.registerCommand('code2ghost.createPostCurrentEditorDraft', async function () {
		// vscode.window.showInformationMessage('Creating Post...');
		createPost(context, 0);	
	});

	const create_post_current_editor_publish = vscode.commands.registerCommand('code2ghost.createPostCurrentEditorPublish', async function () {
		vscode.window.showInformationMessage('Creating Post...');
		createPost(context, 1);
	});	

	context.subscriptions.push(set_config);
	context.subscriptions.push(get_config);
	context.subscriptions.push(create_post_current_editor_draft);
	context.subscriptions.push(create_post_current_editor_publish);
}

function deactivate() {}

function setConfig(context, url, key) {
	context.globalState.update('ghostUrl', url);
	context.globalState.update('ghostAdminKey', encrypt(key));
}

function getConfig(context) {
	const bareUrl = context.globalState.get('ghostUrl');
	const key = decrypt(context.globalState.get('ghostAdminKey'));
	return { bareUrl, key };
}

function encrypt(text) {
    let cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey), iv);
    let encrypted = cipher.update(text, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
    let textParts = text.split(':');
    let iv = Buffer.from(textParts.shift(), 'hex');
    let encryptedText = textParts.join(':');
    let decipher = crypto.createDecipheriv(algorithm, Buffer.from(secretKey), iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
}

async function createPost(context, publish) {
	
	vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Creating Post...',
			cancellable: false
		},
		async (progress, token) => {
			const { bareUrl, key } = getConfig(context);

			const { title, html } = await getEditor();

			const postTitle = await vscode.window.showInputBox({ prompt: 'Enter Post Title', value: title });
			if (!postTitle) {
				vscode.window.showInformationMessage('Post creation cancelled.');
				return;
			}
			
			// Split the key into ID and SECRET
			const [id, secret] = key.split(':');	

			// Create the token (including decoding secret)
			const authToken = jwt.sign({}, Buffer.from(secret, 'hex'), {
				keyid: id,
				algorithm: 'HS256',
				expiresIn: '5m',
				audience: `/admin/`
			});

			// Make an authenticated request to create a post
			const url = bareUrl + '/ghost/api/admin/posts/?source=html';
			const headers = { Authorization: `Ghost ${authToken}` };
			const payload = {
				posts: [{
					title: postTitle,
					html: html
				}]
			};
			if (publish) {
				payload.posts[0].status = "published";
			}
			let res;
			try {
				res = await axios.post(url, payload, { headers });
			} catch (error) {
				console.error(error);
				vscode.window.showErrorMessage('Failed to create post.');
				return;
			}
			
			if (res.status != 201) {
				vscode.window.showErrorMessage('Failed to create post.');
			} else {
				vscode.window.showInformationMessage('Created Post successful at ' + `[${bareUrl}/ghost/#/editor/post/${res.data.posts[0].id}](${bareUrl}/ghost/#/editor/post/${res.data.posts[0].id})`);
				// vscode.commands.executeCommand('workbench.action.closeActiveEditor');	
			}
		}
	);
}

async function getEditor() {
	const editor = vscode.window.activeTextEditor;
	if (editor) {
		// const filePath = editor.document.uri.fsPath;
		const fileName = editor.document.fileName;
		const fileContent = editor.document.getText();
		const html = marked.parse(fileContent);
		
		// Get all images
		const imageMatches = [...fileContent.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)].map(match => match[2]);

		// TODO: Use a more efficiency way to identifiy title
		const resolvedHtml = await html;
		const h1Match = resolvedHtml.match(/<h1.*?>(.*?)<\/h1>/);
		const h1 = h1Match ? h1Match[1] : 'Untitled';

		const resolvedHtmlWithoutTitle = resolvedHtml.replace(/<h1.*?>(.*?)<\/h1>/, '');
		return { title: h1, html: resolvedHtmlWithoutTitle, images: imageMatches };
	} else {
		vscode.window.showInformationMessage('No file is currently open.');
	}
}

module.exports = {
	activate,
	deactivate
}
