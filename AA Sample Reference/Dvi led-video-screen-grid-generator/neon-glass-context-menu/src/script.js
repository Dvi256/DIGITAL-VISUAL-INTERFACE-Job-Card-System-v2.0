
const $menu = document.getElementById('menu');
const $li = $menu.querySelectorAll('li');
const $hue1 = document.querySelector('#h1');
const $hue2 = document.querySelector('#h2');
const $rand = document.querySelector('footer h2 button');
let cleanTimer;

/* Show the Menu on right-click */

document.addEventListener("contextmenu", (event) => {
    
    const menuBox = $menu.getBoundingClientRect();
    const bodyBox = { width: window.innerWidth, height: window.innerHeight }
    const pos = {  x: event.clientX, y: event.clientY }
    const padding = { x: 30, y: 20 }
    
    /* check if the menu would be off-screen */
    
    const hitX = pos.x + menuBox.width >= bodyBox.width - padding.x;
    const hitY = pos.y + menuBox.height >= bodyBox.height - padding.y;
    
    if ( hitX ) {
        pos.x = bodyBox.width - menuBox.width - padding.x;
    }
    
    if ( hitY ) {
        pos.y = bodyBox.height - menuBox.height - padding.y;
    }
    
    const $target = event.target;
    const isMenu = $menu.contains( $target );
    event.preventDefault();
    
    /* move & show menu (if the event occurs outside the menu) */
    
    if( !isMenu ) {
        $menu.style.left = pos.x + 'px';
        $menu.style.top = pos.y + 'px';
        $menu.classList.add('open');
        clearTimeout(cleanTimer);
    }
    
});

/* close menu when clicking anywhere else */

document.addEventListener('pointerdown', (event) => {
    const $target = event.target;
    const isMenu = $menu.contains( $target );
    const isSlider = $target.matches( 'input' );
    
    if( !isMenu && !isSlider ) {
        
        $menu.classList.remove('open');
        cleanTimer = setTimeout(() => { 
            $menu.querySelector('input').value = ''; 
            $li.forEach($el => {
              $el.classList.remove('selected');  
            })
        }, 200);
        
    /* or handle the selected item styling inside menu */
        
    } else if (isMenu) {
        $li.forEach($el => {
          $el.classList.remove('selected');  
        })
        if ( $target.matches('li') ) {
            $target.classList.add('selected');
        }
    }
});




/* handle color sliders updating UI */

$hue1.addEventListener( 'input', (event) => {
    requestAnimationFrame(() => {
        document.body.style.setProperty('--hue1', event.target.value );
        window.localStorage.setItem('neon-glass-hue1', event.target.value);
        $menu.classList.add('open');
    })
});
$hue2.addEventListener( 'input', (event) => {
    requestAnimationFrame(() => {
        document.body.style.setProperty('--hue2', event.target.value );
        window.localStorage.setItem('neon-glass-hue2', event.target.value);
        $menu.classList.add('open');
    })
});

const setHues = ( random = false ) => {
    const rand1 = 120 + Math.floor(Math.random() * 240);
    const rand2 = rand1 - 80 + (Math.floor(Math.random() * 60) - 30);
    const v1 = random ? rand1 : window.localStorage.getItem('neon-glass-hue1') ?? rand1;
    const v2 = random ? rand2 : window.localStorage.getItem('neon-glass-hue2') ?? rand2;
    $hue1.value = v1;
    $hue2.value = v2;
    document.body.style.setProperty('--hue1', v1 );
    document.body.style.setProperty('--hue2', v2 );
}

setHues();
$rand.addEventListener( 'click', (event) => {
    setHues(true);
    $menu.classList.add('open');
});