// The module 'vscode' contains the VS Code extensibility API

// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const marked = require('marked');
const fs = require('fs');
const crypto = require('crypto');
const algorithm = 'aes-256-cbc';
// const secretKey = 'vOVH6sdmpNWjRRIqCc7rdxs01lwHzfr3';
const secretKey = vscode.workspace.getConfiguration().get('code2ghost.secretKey');
const iv = crypto.randomBytes(16);


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "code2ghost" is now active!');
	console.log('Secret Key:' + secretKey);

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('code2ghost.helloWorld', function () {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from Code2Ghost!');
	});

	const set_config = vscode.commands.registerCommand('code2ghost.setConfig', async function () {
		vscode.window.showInformationMessage('Setting Config...');
		const url = await vscode.window.showInputBox({ prompt: 'Enter Ghost URL' });
		const key = await vscode.window.showInputBox({ prompt: 'Enter Admin API Key' });
		setConfig(context, url, key);
	});

	const get_config = vscode.commands.registerCommand('code2ghost.getConfig', function () {
		const { url, key } = getConfig(context);
		vscode.window.showInformationMessage(`URL: ${url}, Key: ${key}`);
	});

	const create_post_current_editor_draft = vscode.commands.registerCommand('code2ghost.createPostCurrentEditorDraft', async function () {
		vscode.window.showInformationMessage('Creating Post...');
		createPost(context, 0);	
	});

	const create_post_current_editor_publish = vscode.commands.registerCommand('code2ghost.createPostCurrentEditorPublish', async function () {
		vscode.window.showInformationMessage('Creating Post...');
		createPost(context, 1);
	});	

	const get_editor = vscode.commands.registerCommand('code2ghost.getEditor', function () {
		vscode.window.showInformationMessage('Getting Editor...');
		getEditor();
	});

	context.subscriptions.push(disposable);
	context.subscriptions.push(set_config);
	context.subscriptions.push(get_config);
	context.subscriptions.push(create_post_current_editor_draft);
	context.subscriptions.push(create_post_current_editor_publish);
	context.subscriptions.push(get_editor);
}

// This method is called when your extension is deactivated
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
	const token = jwt.sign({}, Buffer.from(secret, 'hex'), {
		keyid: id,
		algorithm: 'HS256',
		expiresIn: '5m',
		audience: `/admin/`
	});

	// Make an authenticated request to create a post
	const url = 'https://' + bareUrl + '/ghost/api/admin/posts/?source=html';
	const headers = { Authorization: `Ghost ${token}` };
	const payload = {
		posts: [{
			title: postTitle,
			// html: "<p>My post content. Work in progress...</p>",
			html: html,
			// status: "published"
		}]
	};
	if (publish) {
		payload.posts[0].status = "published";
	}
	axios.post(url, payload, { headers })
		.then(response => console.log(response))
		.catch(error => console.error(error));
}

async function getEditor() {
	const editor = vscode.window.activeTextEditor;
	if (editor) {
		// const filePath = editor.document.uri.fsPath;
		const fileName = editor.document.fileName;
		const fileContent = editor.document.getText();
		const html = marked.parse(fileContent);
		// console.log(html);
		
		// TODO: Use a more efficiency way to identifiy title
		const resolvedHtml = await html;
		const h1Match = resolvedHtml.match(/<h1.*?>(.*?)<\/h1>/);
		const h1 = h1Match ? h1Match[1] : 'Untitled';

		const resolvedHtmlWithoutTitle = resolvedHtml.replace(/<h1.*?>(.*?)<\/h1>/, '');
		return { title: h1, html: resolvedHtmlWithoutTitle };

	} else {
		vscode.window.showInformationMessage('No file is currently open.');
	}
}

module.exports = {
	activate,
	deactivate
}
