all: matanuionlinegame.swf

matanuionlinegame.swf:
	printf '%s' 'Array(function(WIDTH, HEIGHT, MOVIE) {' > matanuionlinegame.as
	cat ../shared/matanuionlinegame.as >> matanuionlinegame.as
	printf '\n%s' '})[0].call(this, 770, 443, "player");' >> matanuionlinegame.as
	makeswf \
		-c -1 \
		-v 6 \
		-s 770x443 \
		-r 12 \
		-b 000000 \
		-o matanuionlinegame.main.swf \
		matanuionlinegame.as
	swfcombine \
		-v \
		-m \
		-l \
		-o matanuionlinegame.swf \
		matanuionlinegame.main.swf \
		-f 1=../shared/fonts/trademarker_light.swf \
		-f 1=../shared/fonts/gillsans.swf
	chmod -x matanuionlinegame.swf
	rm matanuionlinegame.as matanuionlinegame.main.swf*
