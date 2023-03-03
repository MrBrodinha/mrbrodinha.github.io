let speed = 20;
let scale = 0.17;
let canvas;
let ctx;
let logoColor;

let dvd = {
    x: 0,
    y: 0,
    xspeed: 50,
    yspeed: 40,
    img: new Image()
};

(function main(){
    canvas = document.getElementById("tv-screen");
    ctx = canvas.getContext("2d");
    dvd.img.src = 'EasterEgg/annoying-dog-png.png';

    //Draw the "tv screen"
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    update();
})();

function update() {
    setTimeout(() => {
        //Draw DVD Logo and his background
        ctx.drawImage(dvd.img, dvd.x, dvd.y, dvd.img.width*scale, dvd.img.height*scale);
        //Move the logo
        dvd.x+=dvd.xspeed;
        dvd.y+=dvd.yspeed;
        //Check for collision 
        checkHitBox();
        update();   
    }, speed)
}

//Check for border collision
function checkHitBox(){
    if (dvd.x + dvd.img.width*scale >= canvas.width || dvd.x <= 0) {
        dvd.xspeed *= -1;
    }
        
    if (dvd.y + dvd.img.height*scale >= canvas.height || dvd.y <= 0) {
        dvd.yspeed *= -1;
    }    
}
