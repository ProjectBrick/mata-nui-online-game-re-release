var self = this;
var forEach = function(a, f) {
	for (var i = 0, l = a.length; i < l; i++) {
		f(a[i], i);
	}
};
var colorRGB = function(c) {
	return c & 0xFFFFFF;
};
var colorA = function(c) {
	return ((c >>> 24) / 0xFF) * 100;
};
var drawRectangle = function(mc, x, y, w, h, r, fC, sC, sW) {
	mc.lineStyle(sW, colorRGB(sC), colorA(sC));
	mc.beginFill(colorRGB(fC), colorA(fC));
	if (r) {
		mc.moveTo(x + r, y);
		mc.lineTo(x + w - r, y);
		mc.curveTo(x + w, y, x + w, y + r);
		mc.lineTo(x + w, y + r);
		mc.lineTo(x + w, y + h - r);
		mc.curveTo(x + w, y + h, x + w - r, y + h);
		mc.lineTo(x + w - r, y + h);
		mc.lineTo(x + r, y + h);
		mc.curveTo(x, y + h, x, y + h - r);
		mc.lineTo(x, y + h - r);
		mc.lineTo(x, y + r);
		mc.curveTo(x, y, x + r, y);
		mc.lineTo(x + r, y);
	}
	else {
		mc.moveTo(x, y);
		mc.lineTo(x + w, y);
		mc.lineTo(x + w, y + h);
		mc.lineTo(x, y + h);
		mc.lineTo(x, y);
	}
	mc.endFill();
};
var newTextField = function(mc, name, level, x, y, w, h, autoSize) {
	// If width or height are automatic, use 0 or high number respectively.
	// If a set width, use multiline, if no height set, automatic size.
	var high = 0xFFFFFF;
	mc.createTextField(name, level, x, y, w < 0 ? 0 : w, h < 0 ? high : h);
	var txt = mc[name];
	txt.autoSize = h < 0 ? autoSize || "left" : "none";
	txt.wordWrap = txt.multiline = !(w < 0);
	return txt;
};

// UI styles.
var colorName = 0xFFB99359;
var colorLink = 0xFFFF9900;
var colorBack = 0xFF333333;
var colorLine = 0xFF999999;
var boxStroke = 2;

// UI layers.
var menuLayer = 1;

var createButtons = function(
	parent,
	buttons,
	size,
	vertical,
	wide,
	stroke,
	padding
) {
	var buttonW = vertical ? wide : ((
		wide - (buttons.length - 1) * padding
	) / buttons.length);
	var buttonY = 0;
	forEach(buttons, function(d, i) {
		var btn = parent.createEmptyMovieClip(
			"btn_" + i,
			i + 1
		);
		var txtW = buttonW - (padding * 2);
		var txt = newTextField(
			btn, "text", 1, padding, padding, txtW, -1, "center"
		);
		txt.selectable = false;
		txt._alpha = colorA(colorLink);
		txt.text = d.title;
		txt.embedFonts = true;
		var fmt = new TextFormat();
		fmt.font = "font_trademarker_light";
		fmt.size = size;
		fmt.align = "center";
		fmt.color = colorRGB(colorLink);
		txt.setTextFormat(fmt);

		var boxW = buttonW - (stroke * 2);
		var boxH = txt._height + (padding * 2) - (stroke * 2);
		drawRectangle(
			btn, stroke, stroke, boxW, boxH, 0, colorBack, colorLine, stroke
		);

		if (vertical) {
			btn._y = buttonY;
			buttonY = btn._y + btn._height + padding;
		}
		else {
			btn._x = i * (buttonW + padding);
		}

		btn.onRelease = function() {
			d.action();
		};
	});
};

var setupMenu = function() {
	var menu = self.createEmptyMovieClip("menu", menuLayer);
	var button18FPS = function() {
		return {
			title: "18 FPS: Original",
			action: function() {
				menu.removeMovieClip();
				loadMovieNum(MOVIE + ".swf", 0);
			}
		};
	};
	var button30FPS = function() {
		return {
			title: "30 FPS: Faster",
			action: function() {
				menu.removeMovieClip();
				loadMovieNum(MOVIE + "-30fps.swf", 0);
			}
		};
	};
	var title = function() {
		var title = menu.createEmptyMovieClip("title", 1);
		var titleText = newTextField(
			title, "text", 1, 0, 0, WIDTH, -1, "center"
		);
		titleText._x = 0;
		titleText._y = (HEIGHT / 2) - 140;
		titleText._alpha = colorA(colorName);
		titleText.selectable = false;
		titleText.text = Array(
			"Mata Nui Online Game:",
			"Re-Release"
		).join("\n");
		titleText.embedFonts = true;
		var titleTextFmt = new TextFormat();
		titleTextFmt.font = "font_trademarker_light";
		titleTextFmt.size = 32;
		titleTextFmt.align = "center";
		titleTextFmt.color = colorRGB(colorName);
		titleText.setTextFormat(titleTextFmt);
	};
	var buttons = function() {
		var wide = 300;
		var list = [
			button18FPS(),
			button30FPS()
		];
		var buttons = menu.createEmptyMovieClip("buttons", 2);
		buttons._x = (WIDTH - wide) * 0.5;
		buttons._y = (HEIGHT / 2) - 20;
		createButtons(buttons, list, 24, true, wide, boxStroke, 16);
	};
	title();
	buttons();
};

var main = function() {
	setupMenu();
};

main();
