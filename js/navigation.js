document.addEventListener('DOMContentLoaded', function() {
    const hamburger = document.querySelector('.hamburger-menu');
    const sidebar = document.querySelector('.sidebar');
    const closeButton = document.querySelector('.close-sidebar');

    // Toggle sidebar when hamburger menu is clicked
    hamburger.addEventListener('click', function() {
        sidebar.classList.add('active');
    });

    // Close sidebar when close button is clicked
    closeButton.addEventListener('click', function() {
        sidebar.classList.remove('active');
    });

    // Close sidebar when clicking outside
    document.addEventListener('click', function(event) {
        if (!sidebar.contains(event.target) && !hamburger.contains(event.target)) {
            sidebar.classList.remove('active');
        }
    });
}); 