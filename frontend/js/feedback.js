// feedback.js - Handles user auth, feedback submission
(function () {
    var API_BASE_LOCAL = window.WEATHERE_API_BASE_URL || "https://weathere4-backend.onrender.com";

    var currentUser = {
        id: null,
        displayName: null,
        email: null,
        token: null
    };

    function saveUserToStorage() {
        try {
            localStorage.setItem("weathere_user", JSON.stringify(currentUser));
        } catch (e) {
            console.error("Failed to save user:", e);
        }
    }

    function loadUserFromStorage() {
        try {
            var raw = localStorage.getItem("weathere_user");
            if (!raw) return;
            var parsed = JSON.parse(raw);
            if (parsed && parsed.id && parsed.token) {
                currentUser = parsed;
            }
        } catch (e) {
            console.error("Failed to load user:", e);
        }
    }

    function updateAuthUI() {
        var authBtn = document.getElementById("auth-button");
        var authPanel = document.getElementById("auth-panel");
        var authMsg = document.getElementById("auth-message");
        if (!authBtn || !authPanel) return;

        if (currentUser && currentUser.id) {
            authBtn.innerHTML = '<i class="fas fa-user-check"></i> ' + (currentUser.displayName || "Signed in");
            if (authMsg) {
                authMsg.textContent = "Signed in as " + (currentUser.email || currentUser.displayName);
                authMsg.style.color = "#555";
            }
            authPanel.classList.remove("visible");
        } else {
            authBtn.innerHTML = '<i class="fas fa-user"></i> Sign in';
            if (authMsg) {
                authMsg.textContent = "You must sign in to submit feedback.";
                authMsg.style.color = "#555";
            }
        }
    }

    function toggleAuthPanel() {
        var panel = document.getElementById("auth-panel");
        if (!panel) return;
        panel.classList.toggle("visible");

        // Auto-focus email field when panel opens
        if (panel.classList.contains("visible")) {
            setTimeout(() => {
                var emailInput = document.getElementById("auth-email");
                if (emailInput) emailInput.focus();
            }, 100);
        }
    }

    async function registerUser() {
        var emailEl = document.getElementById("auth-email");
        var passEl = document.getElementById("auth-password");
        var nameEl = document.getElementById("auth-displayName");
        var msg = document.getElementById("auth-message");

        var email = emailEl.value.trim();
        var password = passEl.value;
        var displayName = nameEl.value.trim();

        if (!email || !password || !displayName) {
            msg.textContent = "Please fill in email, password, and display name.";
            msg.style.color = "#c0392b";
            return;
        }

        try {
            var res = await fetch(API_BASE_LOCAL + "/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email, password: password, displayName: displayName })
            });

            // Handle service unavailable
            if (res.status === 503) {
                msg.textContent = "Service temporarily unavailable. Please try again later.";
                msg.style.color = "#c0392b";
                return;
            }

            var data = await res.json();

            if (!res.ok) {
                msg.textContent = data.error || "Registration failed.";
                msg.style.color = "#c0392b";
                return;
            }

            currentUser = {
                id: data.user.id,
                displayName: data.user.displayName,
                email: data.user.email,
                token: data.token
            };
            saveUserToStorage();
            msg.textContent = "Registered and signed in successfully!";
            msg.style.color = "#27ae60";
            updateAuthUI();

            // Clear form fields
            emailEl.value = "";
            passEl.value = "";
            nameEl.value = "";

            window.weathereAuth = {
                isLoggedIn: true,
                token: currentUser.token,
                displayName: currentUser.displayName,
                email: currentUser.email
            };

            // Refresh feedback to show user's status
            setTimeout(refreshFeedbackFromServer, 500);
        } catch (e) {
            console.error(e);
            msg.textContent = "Network error during registration. Check your connection.";
            msg.style.color = "#c0392b";
        }
    }

    async function loginUser() {
        var emailEl = document.getElementById("auth-email");
        var passEl = document.getElementById("auth-password");
        var msg = document.getElementById("auth-message");

        var email = emailEl.value.trim();
        var password = passEl.value;

        if (!email || !password) {
            msg.textContent = "Please enter email and password.";
            msg.style.color = "#c0392b";
            return;
        }

        try {
            var res = await fetch(API_BASE_LOCAL + "/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email, password: password })
            });

            // Handle service unavailable
            if (res.status === 503) {
                msg.textContent = "Service temporarily unavailable. Please try again later.";
                msg.style.color = "#c0392b";
                return;
            }

            var data = await res.json();

            if (!res.ok) {
                msg.textContent = data.error || "Login failed.";
                msg.style.color = "#c0392b";
                return;
            }

            currentUser = {
                id: data.user.id,
                displayName: data.user.displayName,
                email: data.user.email,
                token: data.token
            };
            saveUserToStorage();
            msg.textContent = "Signed in successfully!";
            msg.style.color = "#27ae60";
            updateAuthUI();

            // Clear form fields
            emailEl.value = "";
            passEl.value = "";

            window.weathereAuth = {
                isLoggedIn: true,
                token: currentUser.token,
                displayName: currentUser.displayName,
                email: currentUser.email
            };

            // Refresh feedback to show user's status
            setTimeout(refreshFeedbackFromServer, 500);
        } catch (e) {
            console.error(e);
            msg.textContent = "Network error during login. Check your connection.";
            msg.style.color = "#c0392b";
        }
    }

    function getAuthHeaders() {
        var headers = { "Content-Type": "application/json" };
        if (currentUser && currentUser.token) {
            headers["Authorization"] = "Bearer " + currentUser.token;
        }
        return headers;
    }

    function getCurrentForecastTime() {
        // Always use the current hour, not the weather API time
        var now = new Date();
        now.setMinutes(0, 0, 0);
        now.setSeconds(0, 0);
        return now.toISOString();
    }

    async function submitFeedback(isLike) {
        if (!currentUser || !currentUser.id || !currentUser.token) {
            alert("You need to be signed in to rate the forecast.");
            toggleAuthPanel();
            return;
        }

        var rating = isLike ? "like" : "dislike";
        var textarea = document.getElementById("feedback-text");
        var commentText = textarea ? textarea.value.trim() : "";

        // CLIENT-SIDE VALIDATION
        if (commentText.length > 1000) {
            alert("Comment cannot exceed 1000 characters. Your comment is " + commentText.length + " characters.");
            return;
        }

        var loc = window.currentLocationData;
        if (!loc) {
            alert("Location not ready yet.");
            return;
        }

        var body = {
            locationName: loc.display_name,
            latitude: Number(loc.lat),
            longitude: Number(loc.lon),
            timezone: "auto",
            forecastTime: getCurrentForecastTime(),
            rating: rating,
            commentText: commentText
        };

        console.log("Submitting feedback:", body);

        try {
            var res = await fetch(API_BASE_LOCAL + "/api/feedback", {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify(body)
            });

            // Handle service unavailable
            if (res.status === 503) {
                alert("Service temporarily unavailable. Please try again later.");
                return;
            }

            var data = await res.json().catch(function () { return {}; });

            if (res.status === 409) {
                alert("You've already submitted feedback for this forecast hour at this location. Your previous feedback has been updated.");
            }

            // IMPROVED ERROR HANDLING - Check for validation errors
            if (!res.ok) {
                // Check if it's a validation error (usually 400 status)
                if (res.status === 400) {
                    // MongoDB validation errors often come in the error message
                    if (data.error && (data.error.includes("1500 characters") || data.error.includes("maxlength"))) {
                        alert("Comment cannot exceed 1500 characters. Please shorten your comment.");
                        return;
                    }
                    alert("Validation error: " + (data.error || "Please check your input"));
                    return;
                }

                // Handle other server errors with more specific messages
                if (res.status === 500) {
                    // Try to parse MongoDB validation errors from 500 responses
                    if (data.error && (data.error.includes("maxlength") || data.error.includes("1500"))) {
                        alert("Comment cannot exceed 1500 characters. Please shorten your comment.");
                        return;
                    }
                    alert("Server error: " + (data.error || "Please try again later"));
                    return;
                }

                // Generic error fallback
                alert("Failed to submit feedback: " + (data.error || res.statusText));
                return;
            }

            if (textarea) textarea.value = "";
            await refreshFeedbackFromServer();
        } catch (e) {
            console.error(e);
            alert("Network error while submitting feedback. Check your connection.");
        }
    }

    async function refreshFeedbackFromServer() {
        var loc = window.currentLocationData;
        if (!loc) {
            console.log("No location data available for feedback refresh");
            return;
        }

        var forecastTime = getCurrentForecastTime();
        console.log("Refreshing feedback for:", loc.display_name, "at", forecastTime);

        var url = new URL(API_BASE_LOCAL + "/api/feedback/summary");
        url.searchParams.set("locationName", loc.display_name);
        url.searchParams.set("forecastTime", forecastTime);

        try {
            console.log("Fetching feedback from:", url.toString());
            var res = await fetch(url.toString());

            if (res.status === 503) {
                // Service unavailable - show friendly message in AI summary
                var aiSummaryEl = document.getElementById("ai-summary");
                if (aiSummaryEl) {
                    aiSummaryEl.textContent = "Service temporarily unavailable. Feedback data will appear here once the service is restored.";
                    aiSummaryEl.style.color = "#777";
                }
                console.log("Service unavailable (503)");
                return;
            }

            if (!res.ok) {
                console.error("Failed to fetch feedback summary:", res.status, res.statusText);
                return;
            }

            var data = await res.json();
            console.log("Received feedback data:", data);
            renderFeedbackFromServer(data);
        } catch (e) {
            console.error("Error fetching feedback summary:", e);
            var aiSummaryEl = document.getElementById("ai-summary");
            if (aiSummaryEl) {
                aiSummaryEl.textContent = "Unable to load feedback data. Please check your internet connection.";
                aiSummaryEl.style.color = "#777";
            }
        }
    }

    function renderFeedbackFromServer(data) {
        var likesEl = document.getElementById("likes-count");
        var dislikesEl = document.getElementById("dislikes-count");
        var accEl = document.getElementById("accuracy-percent");
        var commentsList = document.getElementById("comments-list");
        var aiSummaryEl = document.getElementById("ai-summary");

        if (!likesEl || !dislikesEl || !accEl || !commentsList || !aiSummaryEl) {
            console.log("Missing DOM elements for feedback rendering");
            return;
        }

        var stats = data.stats || { likes: 0, dislikes: 0, totalFeedback: 0, uniqueUsers: 0 };
        likesEl.textContent = stats.likes || 0;
        dislikesEl.textContent = stats.dislikes || 0;

        var total = (stats.likes || 0) + (stats.dislikes || 0);
        if (total === 0) {
            accEl.textContent = "–";
        } else {
            var percent = Math.round((stats.likes / total) * 100);
            accEl.textContent = percent + "%";
        }

        commentsList.innerHTML = "";
        var comments = data.comments || [];
        console.log("Rendering", comments.length, "comments");

        if (!comments.length) {
            commentsList.innerHTML = '<div style="font-size:12px;color:#777;text-align:center;padding:10px;">No comments yet. Be the first to share how the forecast matches real conditions!</div>';
        } else {
            comments.forEach(function (c) {
                var div = document.createElement("div");
                div.className = "comment";
                var date = new Date(c.createdAt || Date.now());
                var dateStr = date.toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                });

                // Add rating icon
                var ratingIcon = c.rating === "like" ?
                    '<i class="fas fa-thumbs-up" style="color:#27ae60;margin-right:5px;"></i>' :
                    '<i class="fas fa-thumbs-down" style="color:#c0392b;margin-right:5px;"></i>';

                div.innerHTML = `
                    <div class="comment-header">
                        <div class="comment-author">${ratingIcon}${c.userDisplayName || "User"}</div>
                        <div class="comment-date">${dateStr}</div>
                    </div>
                    <div class="comment-content">${c.commentText || ""}</div>
                `;
                commentsList.appendChild(div);
            });
        }

        if (data.aiSummary) {
            aiSummaryEl.textContent = data.aiSummary;
            aiSummaryEl.style.color = ""; // Reset color
        } else {
            aiSummaryEl.textContent = "No AI analysis yet. Once there are enough diverse comments from multiple users, the system will generate a summary.";
            aiSummaryEl.style.color = "#777";
        }
    }

    function registerFeedbackHandlers() {
        var likeBtn = document.getElementById("like-btn");
        var dislikeBtn = document.getElementById("dislike-btn");
        var authBtn = document.getElementById("auth-button");
        var loginBtn = document.getElementById("auth-login-btn");
        var registerBtn = document.getElementById("auth-register-btn");

        if (authBtn) {
            authBtn.addEventListener("click", toggleAuthPanel);
        }
        if (likeBtn) {
            likeBtn.addEventListener("click", function () { submitFeedback(true); });
        }
        if (dislikeBtn) {
            dislikeBtn.addEventListener("click", function () { submitFeedback(false); });
        }
        if (loginBtn) {
            loginBtn.addEventListener("click", loginUser);
        }
        if (registerBtn) {
            registerBtn.addEventListener("click", registerUser);
        }

        // Add Enter key support for auth form
        var authEmail = document.getElementById("auth-email");
        var authPassword = document.getElementById("auth-password");
        var authDisplayName = document.getElementById("auth-displayName");

        if (authEmail) {
            authEmail.addEventListener("keypress", function(e) {
                if (e.key === "Enter") {
                    authPassword.focus();
                }
            });
        }
        if (authPassword) {
            authPassword.addEventListener("keypress", function(e) {
                if (e.key === "Enter") {
                    if (authDisplayName && authDisplayName.value.trim()) {
                        registerUser();
                    } else {
                        loginUser();
                    }
                }
            });
        }
        if (authDisplayName) {
            authDisplayName.addEventListener("keypress", function(e) {
                if (e.key === "Enter") {
                    registerUser();
                }
            });
        }
    }

    // Auto-refresh functionality
    let autoRefreshInterval = null;

    function startAutoRefresh() {
        // Clear existing interval if any
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
        }

        // Refresh every 15 seconds to show new bot comments
        autoRefreshInterval = setInterval(() => {
            if (window.currentLocationData) {
                console.log("🔄 Auto-refreshing feedback data");
                refreshFeedbackFromServer();
            }
        }, 15000); // 15 seconds

        console.log("🔄 Auto-refresh started (15 second intervals)");
    }

    // Expose refresh function so weather-core.js can call it after weather loads
    window.refreshFeedbackFromServer = refreshFeedbackFromServer;

    // -------- Init --------
    window.addEventListener("DOMContentLoaded", function () {
        loadUserFromStorage();

        window.weathereAuth = {
            isLoggedIn: !!(currentUser && currentUser.id && currentUser.token),
            token: currentUser ? currentUser.token : null,
            displayName: currentUser ? currentUser.displayName : null,
            email: currentUser ? currentUser.email : null
        };

        updateAuthUI();
        registerFeedbackHandlers();

        // Wait for weather data to load, then refresh feedback
        var checkWeatherLoaded = setInterval(() => {
            if (window.currentLocationData && window.currentWeatherData) {
                clearInterval(checkWeatherLoaded);
                console.log("🌤️ Weather data loaded, refreshing feedback");
                refreshFeedbackFromServer();
                startAutoRefresh();
            }
        }, 500);

        // Fallback: refresh after 5 seconds even if weather not loaded
        setTimeout(() => {
            if (!window.currentLocationData) {
                console.log("⏰ Fallback refresh after 5 seconds");
                refreshFeedbackFromServer();
                startAutoRefresh();
            }
        }, 5000);
    });
})();
