"""Deployment smoke test using a newly created disposable account only."""
import json
import secrets
import subprocess
import urllib.request
import urllib.error

BASE = "http://127.0.0.1/api"
username = "profile_smoke_" + secrets.token_hex(6)
password = secrets.token_urlsafe(24)
token = None
refresh = None
created = False


def call(path, method="GET", data=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + path, method=method, headers=headers,
                                 data=None if data is None else json.dumps(data).encode())
    with urllib.request.urlopen(req, timeout=30) as response:
        result = json.load(response)
    if result.get("code") != 0:
        raise AssertionError(f"{method} {path} failed")
    return result.get("data")


try:
    call("/auth/register", "POST", {"username": username, "password": password, "confirmPassword": password})
    created = True
    login = call("/auth/login", "POST", {"username": username, "password": password})
    token, refresh = login["token"], login.get("refreshToken")
    before = call("/user/profile")
    assert before["username"] == username
    assert all(before[key] == 0 for key in ("plannedCities", "plannedDays", "paidTotal", "publishedNotes"))
    assert call("/user/level")["checkedIn"] is False
    first = call("/user/check-in", "POST")
    second = call("/user/check-in", "POST")
    assert first["awardedPoints"] == 5 and second["awardedPoints"] == 0
    assert first["points"] == second["points"] == before["points"] + 5
    assert second["checkedIn"] is True
    call("/user/profile", "PUT", {"nickname": "Profile smoke test", "bio": "Disposable deployment verification"})
    saved = call("/user/profile")
    assert saved["nickname"] == "Profile smoke test" and saved["points"] == second["points"]
    assert call("/user/level")["checkedIn"] is True
    assert call("/orders") == [] and call("/coupons?status=unused") == []
    print("PASS: profile statistics, persistent profile edit, check-in reward, duplicate check-in, level and account lists", flush=True)
finally:
    if token:
        try:
            call("/user/logout", "POST", {"refreshToken": refresh})
        except Exception:
            print("WARNING: disposable test session logout failed", flush=True)
    if created:
        # Only remove the synthetic account created by this process; never touch existing accounts.
        assert username.startswith("profile_smoke_") and username.replace("_", "").isalnum()
        sql = f"DELETE FROM users WHERE username = '{username}'; SELECT ROW_COUNT();"
        result = subprocess.run([
            "docker", "exec", "-i", "travel-mysql", "sh", "-c",
            'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot -N "$MYSQL_DATABASE"'
        ], input=sql, text=True, capture_output=True, check=True)
        assert result.stdout.strip() == "1", "Disposable account cleanup failed"
        print("PASS: disposable test account removed", flush=True)
