import {Manager} from '@shockpkg/core';
import {
	Plist,
	ValueDict,
	ValueString,
	ValueBoolean
} from '@shockpkg/plist-dom';
import {
	BundleSaWindows,
	BundleSaMac,
	BundleSaLinux,
	loader
} from '@shockpkg/swf-projector';

import {
	appName,
	appDomain,
	version,
	author,
	copyright,
	appFile,
	appDmgTitle,
	versionShort,
	distName
} from './util/meta.mjs';
import {docs} from './util/doc.mjs';
import {makeZip, makeTgz, makeExe, makeDmg} from './util/dist.mjs';
import {copyFile, outputFile, remove} from './util/fs.mjs';
import {Propercase} from './util/propercase.mjs';
import {SourceZip, SourceDir, readSources} from './util/source.mjs';
import {flash4FpsCap, setFps} from './util/fps.mjs';

async function * resources() {
	const pc = await Propercase.init('propercase.txt', '.cache/propercase');
	for await (const [file, read] of readSources([
		new SourceDir('mod'),
		new SourceZip('original/lego-re-release/MataNui.zip', 'matanui/')
	])) {
		if (/^[^.][^\\/]+\.(swf|txt|bin|zip)$/i.test(file)) {
			let data = await read();
			if (/\.(swf|txt)$/i.test(file)) {
				data = await pc.dataCached(data);
			}
			if (/\.swf$/i.test(file)) {
				setFps(data, flash4FpsCap);
			}
			yield [pc.name(file), data];
		}
	}
}

async function walkthroughs(dir) {
	for await (const [file, read] of readSources([
		new SourceZip('original/lego-re-release/MataNuiWalkthrough.zip', ''),
		new SourceZip('original/lego-re-release/TextWalkthrough.zip', '')
	])) {
		if (/^[^.][^\\/]+\.(pdf)$/i.test(file)) {
			await outputFile(`${dir}/${file}`, await read());
		}
	}
}

function movie(delay) {
	const swfv = 6;
	const [w, h] = [480, 360];
	const fps = 12;
	const bg = 0x000000;
	const url = 'matanuionlinegame.swf';
	return loader(swfv, w, h, fps, bg, url, delay ? Math.round(fps / 2) : 0);
}

async function bundler(b) {
	let playerData = null;
	for await (const [file, data] of resources()) {
		if (file === 'player.swf') {
			playerData = data;
		}
		await b.createResourceFile(file, data);
	}
	setFps(playerData, 30);
	await b.createResourceFile('player-30fps.swf', playerData);
	await b.copyResourceFile(
		'autorun.swf',
		'original/lego-re-release/projectors/win/autorun.swf'
	);
	await b.copyResourceFile(
		'matanuionlinegame.swf',
		'src/projector/matanuionlinegame.swf'
	);
}

async function browser(dest) {
	let playerData = null;
	for await (const [file, data] of resources()) {
		if (/^(Launcher(-full)?|autorun)(-30fps)?\.swf$/.test(file)) {
			continue;
		}
		if (file === 'player.swf') {
			playerData = data;
		}
		await outputFile(`${dest}/${file}`, data);
	}
	setFps(playerData, 30);
	await outputFile(`${dest}/player-30fps.swf`, playerData);
	await Promise.all([
		'index.html',
		'matanuionlinegame.swf'
	].map(f => copyFile(`src/browser/${f}`, `${dest}/${f}`)));
}

const task = {'': _ => Object.keys(task).map(t => t && console.error(t)) && 1};

task['clean'] = async () => {
	await remove('.cache', 'build', 'dist');
};

task['build:pages'] = async () => {
	const build = 'build/pages';
	await remove(build);
	await browser(build);
	await walkthroughs(`${build}/Walkthrough`);
	await docs('docs', build);
};

task['build:browser'] = async () => {
	const build = 'build/browser';
	await remove(build);
	await browser(`${build}/data`);
	await outputFile(
		`${build}/${appFile}.html`,
		'<meta http-equiv="refresh" content="0;url=data/index.html">\n'
	);
	await walkthroughs(`${build}/Walkthrough`);
	await docs('docs', build);
};

task['dist:browser:zip'] = async () => {
	await makeZip(`dist/${distName}-Browser.zip`, 'build/browser');
};

task['dist:browser:tgz'] = async () => {
	await makeTgz(`dist/${distName}-Browser.tgz`, 'build/browser');
};

for (const [type, pkg] of Object.entries({
	'i386': 'flash-player-35.0.0.204-windows-i386-sa-2022-08-13',
	'x86_64': 'flash-player-35.0.0.204-windows-x86_64-sa-2022-08-13',
	'x86_64-debug': 'flash-player-35.0.0.204-windows-x86_64-sa-debug-2022-08-13'
})) {
	const build = `build/windows-${type}`;
	task[`build:windows-${type}`] = async () => {
		await remove(build);
		const file = `${appFile}.exe`;
		const b = new BundleSaWindows(`${build}/${file}`);
		b.projector.player = await new Manager().file(pkg);
		b.projector.movieData = movie(false);
		b.projector.versionStrings = {
			FileVersion: version,
			ProductVersion: versionShort,
			CompanyName: author,
			FileDescription: appName,
			LegalCopyright: copyright,
			ProductName: appName,
			LegalTrademarks: '',
			OriginalFilename: file,
			InternalName: appFile,
			Comments: ''
		};
		b.projector.iconFile = 'res/app-icon-windows.ico';
		b.projector.patchWindowTitle = appName;
		b.projector.patchOutOfDateDisable = true;
		b.projector.removeCodeSignature = true;
		await b.write(bundler);
		await walkthroughs(`${build}/Walkthrough`);
		await docs('docs', build);
	};
	task[`dist:windows-${type}:zip`] = async () => {
		await makeZip(`dist/${distName}-Windows-${type}.zip`, build);
	};
	task[`dist:windows-${type}:exe`] = async () => {
		await makeExe(
			`dist/${distName}-Windows-${type}.exe`,
			/x86_64/.test(type) ? 'x64 arm64' : '',
			appDomain,
			appName,
			appFile,
			version,
			author,
			copyright,
			'LICENSE.txt',
			'res/inno-icon.ico',
			'res/inno-header/*.bmp',
			'res/inno-sidebar/*.bmp',
			`${build}/*`,
			[
				[`${appFile}.exe`, appFile, true, true],
				['README.html', `${appFile} - README`],
				[
					'Walkthrough\\Mata Nui Walkthrough.pdf',
					`${appFile} - Walkthrough`
				],
				[
					'Walkthrough\\Text Walkthrough.pdf',
					`${appFile} - Walkthrough - Text`
				]
			]
		);
	};
}

for (const [type, pkg] of Object.entries({
	'x86_64': 'flash-player-35.0.0.204-mac-x86_64-sa-2022-07-04',
	'x86_64-debug': 'flash-player-35.0.0.204-mac-x86_64-sa-debug-2022-07-04'
})) {
	const build = `build/mac-${type}`;
	task[`build:mac-${type}`] = async () => {
		await remove(build);
		const pkgInfo = 'APPL????';
		const b = new BundleSaMac(`${build}/${appFile}.app`);
		b.projector.player = await new Manager().file(pkg);
		b.projector.movieData = movie(false);
		b.projector.binaryName = appFile;
		b.projector.pkgInfoData = pkgInfo;
		b.projector.infoPlistData = (new Plist(new ValueDict(new Map([
			['CFBundleInfoDictionaryVersion', new ValueString('6.0')],
			['CFBundleDevelopmentRegion', new ValueString('en-US')],
			['CFBundleExecutable', new ValueString('')],
			['CFBundleIconFile', new ValueString('')],
			['CFBundleName', new ValueString(appName)],
			['NSHumanReadableCopyright', new ValueString(copyright)],
			['CFBundleGetInfoString', new ValueString(copyright)],
			['CFBundleIdentifier', new ValueString(appDomain)],
			['CFBundleVersion', new ValueString(version)],
			['CFBundleLongVersionString', new ValueString(version)],
			['CFBundleShortVersionString', new ValueString(versionShort)],
			['CFBundlePackageType', new ValueString(pkgInfo.substring(0, 4))],
			['CFBundleSignature', new ValueString(pkgInfo.substring(4))],
			['NSAppTransportSecurity', new ValueDict(new Map([
				['NSAllowsArbitraryLoads', new ValueBoolean(true)]
			]))],
			['NSSupportsAutomaticGraphicsSwitching', new ValueBoolean(true)],
			['NSHighResolutionCapable', new ValueBoolean(true)],
			['CSResourcesFileMapped', new ValueBoolean(true)],
			['LSPrefersCarbon', new ValueString('YES')],
			['NSAppleScriptEnabled', new ValueString('YES')],
			['NSMainNibFile', new ValueString('MainMenu')],
			['NSPrincipalClass', new ValueString('NSApplication')]
		])))).toXml();
		b.projector.iconFile = 'res/app-icon-mac.icns';
		b.projector.patchWindowTitle = appName;
		b.projector.removeInfoPlistStrings = true;
		b.projector.removeCodeSignature = true;
		await b.write(bundler);
		await walkthroughs(`${build}/Walkthrough`);
		await docs('docs', build);
	};
	task[`dist:mac-${type}:tgz`] = async () => {
		await makeTgz(`dist/${distName}-Mac-${type}.tgz`, build);
	};
	task[`dist:mac-${type}:dmg`] = async () => {
		await makeDmg(
			`dist/${distName}-Mac-${type}.dmg`,
			appDmgTitle,
			'res/dmg-icon.icns',
			'res/dmg-background/dmg-background.png',
			[640, 512],
			128,
			[
				[-160, -148, 'file', `${build}/${appFile}.app`],
				[160, -148, 'link', '/Applications'],
				[-160, 100, 'file', `${build}/README.html`],
				[160, 100, 'file', `${build}/Walkthrough`]
			]
		);
	};
}

for (const [type, pkg] of Object.entries({
	'i386': 'flash-player-11.2.202.644-linux-i386-sa',
	'i386-debug': 'flash-player-11.2.202.644-linux-i386-sa-debug',
	'x86_64': 'flash-player-32.0.0.465-linux-x86_64-sa',
	'x86_64-debug': 'flash-player-32.0.0.465-linux-x86_64-sa-debug'
})) {
	const build = `build/linux-${type}`;
	task[`build:linux-${type}`] = async () => {
		await remove(build);
		const b = new BundleSaLinux(`${build}/${appFile}`);
		b.projector.player = await new Manager().file(pkg);
		b.projector.movieData = movie(true);
		b.projector.patchProjectorOffset = /x86_64/.test(type);
		b.projector.patchProjectorPath = true;
		b.projector.patchWindowTitle = appName;
		await b.write(bundler);
		await walkthroughs(`${build}/Walkthrough`);
		await docs('docs', build);
	};
	task[`dist:linux-${type}:tgz`] = async () => {
		await makeTgz(`dist/${distName}-Linux-${type}.tgz`, build);
	};
}

process.exitCode = await task[process.argv[2] || '']();
