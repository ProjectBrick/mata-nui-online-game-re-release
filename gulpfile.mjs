import fse from 'fs-extra';
import gulp from 'gulp';
import {marked} from 'marked';
import {Manager} from '@shockpkg/core';
import {
	Plist,
	ValueDict,
	ValueString,
	ValueBoolean
} from '@shockpkg/plist-dom';
import {
	BundleWindows32,
	BundleMacApp,
	BundleLinux32,
	BundleLinux64,
	loader
} from '@shockpkg/swf-projector';

import {
	filename,
	slugify
} from './util/string.mjs';
import {
	imageSize,
	pngs2bmps,
	readIco,
	readIcns
} from './util/image.mjs';
import {
	makeZip,
	makeTgz,
	makeExe,
	makeDmg
} from './util/dist.mjs';
import {Propercase} from './util/propercase.mjs';
import {
	SourceZip,
	SourceDir
} from './util/sources.mjs';
import {Server} from './util/server.mjs';
import {setFps} from './util/swf.mjs';

const {
	appName,
	appNameShort,
	appDomain,
	version,
	author,
	copyright
} = await fse.readJSON('./package.json');

const distName = slugify(`${appName}-${version}`);
const versionShort = version.split('.').slice(0, 2).join('.');
const serverPort = +process.env.SERVER_PORT;

// This was a Flash 4 game, and the maximum FPS in Flash Player 4 was 18.
// The FPS set in the SWF files is greater, leading to faster playback.
// http://www.macromedia.com/support/flash/releasenotes/player/releasenotes_player_5.htm
const correctFps = 18;

const sources = {
	'mod': () => new SourceDir(
		'mod'
	),
	'lego-re-release': () => new SourceZip(
		'original/lego-re-release/MataNui.zip',
		'matanui/'
	),
	'lego-re-release-walkthrough-full': () => new SourceZip(
		'original/lego-re-release/MataNuiWalkthrough.zip',
		''
	),
	'lego-re-release-walkthrough-text': () => new SourceZip(
		'original/lego-re-release/TextWalkthrough.zip',
		''
	)
};

async function shockpkgFile(pkg) {
	return (new Manager()).with(
		async manager => manager.packageInstallFile(pkg)
	);
}

function templateStrings(str, vars) {
	return str.replace(/\$\{([^\}]*?)\}/g, (_, p1) => {
		if (!vars.hasOwnProperty(p1)) {
			throw new Error(`Undefined template variable: ${p1}`);
		}
		return vars[p1];
	});
}

async function readSources(order, each) {
	const propercase = new Propercase('propercase.txt');
	propercase.cacheDir = '.cache/propercase';
	await propercase.init();

	const ordered = order.map(id => ({
		id,
		source: sources[id]()
	}));
	for (const {source} of ordered) {
		await source.open();
	}

	const mapped = new Map();
	for (const {id, source} of ordered) {
		await source.each(async entry => {
			const p = entry.path.toLowerCase();
			if (p.endsWith('/') || mapped.has(p)) {
				return;
			}
			mapped.set(p, {
				source: id,
				path: propercase.name(entry.path),
				read: async () => {
					let data = await entry.read();
					if (/\.(swf|txt)$/i.test(p)) {
						data = await propercase.dataCached(data);
					}
					if (/\.swf$/i.test(p)) {
						setFps(data, correctFps);
					}
					return data;
				}
			});
		});
	}
	for (const id of [...mapped.keys()].sort()) {
		await each(mapped.get(id));
	}

	for (const {source} of ordered) {
		await source.close();
	}
}

async function readSourcesFiltered(each) {
	const sources = [
		'mod',
		'lego-re-release'
	];
	await readSources(sources, async entry => {
		if (!/^[^.][^\\/]+\.(swf|txt|bin|zip)$/i.test(entry.path)) {
			return;
		}
		await each(entry);
	});
}

async function readSourcesWalkthrough(each) {
	const sources = [
		'lego-re-release-walkthrough-full',
		'lego-re-release-walkthrough-text'
	];
	await readSources(sources, async entry => {
		if (!/^[^.][^\\/]+\.(pdf)$/i.test(entry.path)) {
			return;
		}
		await each(entry);
	});
}

async function addDocs(dir) {
	const template = await fse.readFile('docs/template.html', 'utf8');
	await Promise.all((await fse.readdir('docs'))
		.filter(f => /^[^\.].*\.md$/i.test(f))
		.map(f => fse.readFile(`docs/${f}`, 'utf8').then(src => {
			const body = marked(src, {
				gfm: true,
				breaks: true,
				smartypants: true
			}).trim();
			const title = (
				body.match(/<h\d[^>]*>([\s\S]*?)<\/h\d>/) || []
			)[1] || '';
			return fse.writeFile(
				`${dir}/${f}`.replace(/\.md$/i, '.html'),
				templateStrings(template, {
					title,
					body
				})
			);
		}))
	);
}

async function outputWalkthroughs(dir) {
	await readSourcesWalkthrough(async entry => {
		await fse.outputFile(
			`${dir}/${entry.path}`,
			await entry.read()
		);
	});
}

async function bundle(bundle, pkg, delay = false) {
	await bundle.withData(
		await shockpkgFile(pkg),
		loader(
			5,
			480,
			360,
			12,
			0x000000,
			'matanuionlinegame.swf',
			delay ? 12 / 2 : 0
		),
		async b => {
			let playerData = null;
			await readSourcesFiltered(async entry => {
				const data = await entry.read();
				if (entry.path === 'player.swf') {
					playerData = data;
				}
				await b.createResourceFile(entry.path, data);
			});
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
	);
}

async function createBundleMac(path) {
	const pkgInfo = 'APPL????';
	const infoPlist = new Plist(new ValueDict(new Map(Object.entries({
		CFBundleInfoDictionaryVersion: new ValueString('6.0'),
		CFBundleDevelopmentRegion: new ValueString('en-US'),
		CFBundleExecutable: new ValueString(''),
		CFBundleIconFile: new ValueString(''),
		CFBundleName: new ValueString(appName),
		NSHumanReadableCopyright: new ValueString(copyright),
		CFBundleGetInfoString: new ValueString(copyright),
		CFBundleIdentifier: new ValueString(appDomain),
		CFBundleVersion: new ValueString(version),
		CFBundleLongVersionString: new ValueString(version),
		CFBundleShortVersionString: new ValueString(versionShort),
		CFBundlePackageType: new ValueString(pkgInfo.substr(0, 4)),
		CFBundleSignature: new ValueString(pkgInfo.substr(4)),
		NSAppTransportSecurity: new ValueDict(new Map(Object.entries({
			NSAllowsArbitraryLoads: new ValueBoolean(true)
		}))),
		NSSupportsAutomaticGraphicsSwitching: new ValueBoolean(true),
		NSHighResolutionCapable: new ValueBoolean(true),
		CSResourcesFileMapped: new ValueBoolean(true),
		LSPrefersCarbon: new ValueString('YES'),
		NSAppleScriptEnabled: new ValueString('YES'),
		NSMainNibFile: new ValueString('MainMenu'),
		NSPrincipalClass: new ValueString('NSApplication')
	}))));

	const bundle = new BundleMacApp(path);
	const {projector} = bundle;
	projector.binaryName = appName;
	projector.pkgInfoData = pkgInfo;
	projector.infoPlistDocument = infoPlist;
	projector.iconData = await readIcns('res/app-icon-mac.iconset');
	projector.patchWindowTitle = appNameShort;
	projector.removeInfoPlistStrings = true;
	projector.removeCodeSignature = true;
	return bundle;
}

async function createBundleWindows(path) {
	const file = path.split(/[/\\]/).pop();
	const fileName = file.replace(/\.exe$/i, '');
	const versionStrings = {
		FileVersion: version,
		ProductVersion: versionShort,
		CompanyName: author,
		FileDescription: appName,
		LegalCopyright: copyright,
		ProductName: appName,
		LegalTrademarks: '',
		OriginalFilename: file,
		InternalName: fileName,
		Comments: ''
	};

	const bundle = new BundleWindows32(path);
	const {projector} = bundle;
	projector.versionStrings = versionStrings;
	projector.iconData = await readIco('res/app-icon-windows');
	projector.patchWindowTitle = appNameShort;
	projector.removeCodeSignature = true;
	return bundle;
}

async function createBundleLinux32(path) {
	const bundle = new BundleLinux32(path);
	const {projector} = bundle;
	projector.patchProjectorPath = true;
	projector.patchWindowTitle = appNameShort;
	return bundle;
}

async function createBundleLinux64(path) {
	const bundle = new BundleLinux64(path);
	const {projector} = bundle;
	projector.patchProjectorPath = true;
	projector.patchProjectorOffset = true;
	projector.patchWindowTitle = appNameShort;
	return bundle;
}

async function buildBrowser(dir, nested) {
	const dest = `build/${dir}`;
	const destData = nested ? `${dest}/data` : dest;
	await fse.remove(dest);
	let playerData = null;
	await readSourcesFiltered(async entry => {
		if (/^Launcher(-full)?(-30fps)?\.swf$/.test(entry.path)) {
			return;
		}
		if (/^autorun(-30fps)?\.swf$/.test(entry.path)) {
			return;
		}
		const data = await entry.read();
		if (entry.path === 'player.swf') {
			playerData = data;
		}
		await fse.outputFile(`${destData}/${entry.path}`, data);
	});
	setFps(playerData, 30);
	await fse.outputFile(`${destData}/player-30fps.swf`, playerData);
	await outputWalkthroughs(`${dest}/Walkthrough`);
	await Promise.all([
		'index.html',
		'matanuionlinegame.swf'
	].map(f => fse.copy(`src/browser/${f}`, `${destData}/${f}`)));
	if (nested) {
		await fse.outputFile(
			`${dest}/${appName}.html`,
			'<meta http-equiv="refresh" content="0;url=data/index.html">\n'
		);
	}
	await addDocs(dest);
}

async function buildWindows(dir, pkg) {
	const dest = `build/${dir}`;
	await fse.remove(dest);
	await bundle(await createBundleWindows(`${dest}/${appName}.exe`), pkg);
	await outputWalkthroughs(`${dest}/Walkthrough`);
	await addDocs(dest);
}

async function buildMac(dir, pkg) {
	const dest = `build/${dir}`;
	await fse.remove(dest);
	await bundle(await createBundleMac(`${dest}/${appName}.app`), pkg);
	await outputWalkthroughs(`${dest}/Walkthrough`);
	await addDocs(dest);
}

async function buildLinux32(dir, pkg) {
	const dest = `build/${dir}`;
	await fse.remove(dest);
	await bundle(await createBundleLinux32(`${dest}/${appName}`), pkg, true);
	await outputWalkthroughs(`${dest}/Walkthrough`);
	await addDocs(dest);
}

async function buildLinux64(dir, pkg) {
	const dest = `build/${dir}`;
	await fse.remove(dest);
	await bundle(await createBundleLinux64(`${dest}/${appName}`), pkg, true);
	await outputWalkthroughs(`${dest}/Walkthrough`);
	await addDocs(dest);
}

async function server(dir) {
	const server = new Server();
	server.dir = dir;
	if (serverPort) {
		server.port = serverPort;
	}
	await server.run(() => {
		console.log(`Server running at: ${server.base}`);
	});
}

gulp.task('clean', async () => {
	await fse.remove('.cache');
	await fse.remove('build');
	await fse.remove('dist');
});

gulp.task('build:pages', async () => {
	await buildBrowser('pages', false);
});

gulp.task('build:browser', async () => {
	await buildBrowser('browser', true);
});

gulp.task('build:windows', async () => {
	await buildWindows(
		'windows',
		'flash-player-32.0.0.465-windows-sa-debug'
	);
});

gulp.task('build:mac', async () => {
	// Release versions on Mac have slow performance when resized larger.
	// Debug versions do not have this performance issue.
	await buildMac(
		'mac',
		'flash-player-32.0.0.465-mac-sa-debug-zip'
	);
});

gulp.task('build:linux-i386', async () => {
	await buildLinux32(
		'linux-i386',
		'flash-player-11.2.202.644-linux-i386-sa-debug'
	);
});

gulp.task('build:linux-x86_64', async () => {
	await buildLinux64(
		'linux-x86_64',
		'flash-player-32.0.0.465-linux-x86_64-sa-debug'
	);
});

gulp.task('dist:browser:zip', async () => {
	await makeZip(`dist/${distName}-Browser.zip`, 'build/browser');
});

gulp.task('dist:browser:tgz', async () => {
	await makeTgz(`dist/${distName}-Browser.tgz`, 'build/browser');
});

gulp.task('dist:windows:zip', async () => {
	await makeZip(`dist/${distName}-Windows.zip`, 'build/windows');
});

gulp.task('dist:windows:exe', async () => {
	const outDir = 'dist';
	const outFile = `${distName}-Windows`;
	const target = `${outDir}/${outFile}.exe`;
	await fse.remove(target);
	const res = `${target}.res`;
	const resIcon = `${res}/icon.ico`;
	const resHeaders = `${res}/headers`;
	const resSidebars = `${res}/sidebars`;
	await fse.remove(res);
	await Promise.all([
		readIco('res/inno-icon').then(d => fse.outputFile(resIcon, d)),
		pngs2bmps('res/inno-header', resHeaders),
		pngs2bmps('res/inno-sidebar', resSidebars),
	]);
	await makeExe('innosetup.iss', {
		VarId: appDomain,
		VarName: appName,
		VarNameFile: filename(appName),
		VarVersion: version,
		VarPublisher: author,
		VarCopyright: copyright,
		VarLicense: 'LICENSE.txt',
		VarIcon: resIcon,
		VarWizardImageHeader: `${resHeaders}/*.bmp`,
		VarWizardImageSidebar: `${resSidebars}/*.bmp`,
		VarWizardImageAlphaFormat: 'none',
		VarExeName: `${filename(appName)}.exe`,
		VarOutDir: outDir,
		VarOutFile: outFile,
		VarSource: `build/windows/*`,
		VarArchitecturesInstallIn64BitMode: '',
		VarArchitecturesAllowed: '',
		VarReadMeName: `${filename(appName)} - README`,
		VarReadMeFile: 'README.html',
		VarWalkthroughFullName: `${filename(appName)} - Walkthrough`,
		VarWalkthroughFullFile: 'Walkthrough\\Mata Nui Walkthrough.pdf',
		VarWalkthroughTextName: `${filename(appName)} - Walkthrough - Text`,
		VarWalkthroughTextFile: 'Walkthrough\\Text Walkthrough.pdf'
	});
	await fse.remove(res);
});

gulp.task('dist:mac:tgz', async () => {
	await makeTgz(`dist/${distName}-Mac.tgz`, 'build/mac');
});

gulp.task('dist:mac:dmg', async () => {
	const background = 'res/dmg-background/dmg-background.png';
	const {width, height} = await imageSize(background);
	const output = `dist/${distName}-Mac.dmg`;
	const icon = `${output}.icns`;
	await fse.outputFile(icon, await readIcns('res/dmg-icon.iconset'));
	await makeDmg(output, {
		format: 'UDBZ',
		title: appNameShort,
		'icon-size': 128,
		icon,
		background,
		window: {
			size: {
				width,
				height
			}
		},
		contents: [
			{
				x: (width / 2) - 160,
				y: 108,
				type: 'file',
				path: `build/mac/${appName}.app`
			},
			{
				x: (width / 2) + 160,
				y: 108,
				type: 'link',
				path: '/Applications'
			},
			{
				x: (width / 2) - 160,
				y: 364,
				type: 'file',
				path: 'build/mac/README.html'
			},
			{
				x: (width / 2) + 160,
				y: 364,
				type: 'file',
				path: 'build/mac/Walkthrough'
			}
		]
	});
	await fse.remove(icon);
});

gulp.task('dist:linux-i386:tgz', async () => {
	await makeTgz(`dist/${distName}-Linux-i386.tgz`, 'build/linux-i386');
});

gulp.task('dist:linux-x86_64:tgz', async () => {
	await makeTgz(`dist/${distName}-Linux-x86_64.tgz`, 'build/linux-x86_64');
});

gulp.task('run:browser', async () => {
	await server('build/browser/data');
});
