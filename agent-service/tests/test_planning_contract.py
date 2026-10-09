"""跨 HTTP 端点验证规划契约，不调用 LLM、地图或生产数据。"""
import asyncio
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from agent.auth import _hmac_sign
from agent.schemas import TravelRequest, RawPlanRequest, AgentEvent
from agent.result_cache import PlanResultCache


def request_data():
    return dict(destination="杭州", origin="北京", days=3, people=5,
                adults=2, children=2, seniors=1, budget=5000, total_budget=10000,
                hotel_level="豪华型", pace="轻松", styles=["博物馆"], months=[12],
                schedule="早起", cabin="商务舱", session_id="session-one", adjustment="多休息",
                user_id="forged-user")


@pytest.mark.parametrize("endpoint", ["/plan", "/plan/stream", "/plan/stream-sse"])
def test_all_endpoints_preserve_preferences_and_bind_identity(monkeypatch, endpoint):
    import main
    captured = []

    class Planner:
        def __init__(self, data, **options):
            captured.append(data)

        async def run(self):
            yield AgentEvent(event_type="complete", data={"destination": "杭州", "people": 5})

    monkeypatch.setattr(main, "TravelAgentPlanner", Planner)
    monkeypatch.setenv("AGENT_API_KEY", "test-gateway-key")
    monkeypatch.setenv("LLM_API_KEY", "test-never-used")
    monkeypatch.setenv("DEMO_MODE", "false")
    response = TestClient(main.app).post("/api/agent" + endpoint, json=request_data(), headers={
        "X-Agent-Key": "test-gateway-key", "X-User-Id": "42",
        "X-User-Sig": _hmac_sign("test-gateway-key", "42"), "Accept-Language": "en-US",
    })
    assert response.status_code == 200
    assert "complete" in response.text or endpoint == "/plan"
    assert len(captured) == 1
    expected = request_data() | {"user_id": "42", "budget": 2000, "ui_lang": "en"}
    for key, value in expected.items():
        assert captured[0][key] == value, key


def test_invalid_party_unknown_fields_and_budget_are_rejected():
    for change in ({"people": 6}, {"origin_typo": "上海"}, {"total_budget": 0}, {"destination": " "}):
        with pytest.raises(ValidationError):
            RawPlanRequest.model_validate(request_data() | change)


def test_total_budget_is_authoritative_in_verification():
    from agent.planner import TravelAgentPlanner
    req = TravelRequest(destination="杭州", people=3, budget=5000, total_budget=1000)
    result = asyncio.run(TravelAgentPlanner(req.model_dump(), demo=True)._phase_verify(
        {"budget_detail": {"food": 1001}, "day_plans": []}, req.budget))
    assert result["budget_total"] == 1000
    assert result["budget_ok"] is False


def test_cache_isolates_party_and_total_budget():
    base = request_data()
    for change in ({"total_budget": 20000}, {"children": 1}, {"user_id": "another"}, {"session_id": "other"}):
        assert PlanResultCache.key(base) != PlanResultCache.key(base | change)


def test_memory_sessions_are_namespaced_by_verified_user(monkeypatch):
    from agent.planner import TravelAgentPlanner
    from agent.memory import memory_store
    keys = []
    monkeypatch.setattr(memory_store, "build_user_context", lambda _: "")
    monkeypatch.setattr(memory_store, "build_session_context", lambda key: keys.append(key) or "")
    for user in ("42", "43", None):
        TravelAgentPlanner({"user_id": user, "session_id": "same-client-session"}, demo=True)._perceive()
    assert keys[0] != keys[1]
    assert keys[2] == ""
