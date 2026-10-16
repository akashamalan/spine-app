"""
Demo identity for SPINE.

This is NOT real authentication. There are no passwords, tokens or user
table: the browser says who it is in two headers, and the server believes
it. It exists so the demo can show two kinds of people (an admin and an
ordinary employee) and so the server, not just the UI, refuses admin-only
routes for the second kind. A real deployment would put a proper identity
provider in front of this and derive the same `User` from it.
"""
from typing import Literal
from urllib.parse import unquote

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel

Role = Literal["admin", "viewer"]


class User(BaseModel):
    person_id: str | None = None
    name: str | None = None
    role: Role = "viewer"

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


def current_user(request: Request) -> User:
    """Read X-Spine-Person / X-Spine-Role. Anything unrecognised is a viewer."""
    h = request.headers
    role: Role = "admin" if h.get("x-spine-role", "").strip().lower() == "admin" else "viewer"
    person = (h.get("x-spine-person") or "").strip() or None
    name = unquote(h.get("x-spine-name", "")).strip() or None
    return User(person_id=person, name=name, role=role)


def require_admin(user: User = Depends(current_user)) -> User:
    """Dependency for admin-only routes. Enforced here, on the server."""
    if not user.is_admin:
        raise HTTPException(
            status_code=403,
            detail="Only administrators can do this. You are signed in as a viewer.",
        )
    return user
