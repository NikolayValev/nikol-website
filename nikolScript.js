$(document).ready(function(){
 
$("mobile_menu");
$("menu_container");
$("close_button");
$("mobile_items");

	
    
    
$(".mobile_menu").on('click',function(){
  $('.menu_container').show();
	$('.mobile_items').show();
	$('.close_button').show();
  

});
   
    
$(".close_button").on('click',function(){
    
   $('.menu_container').hide();

});   
   
    
    
});