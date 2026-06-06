"""Pydantic request/response models for getfittr.

These describe the JSON shapes crossing the API boundary. The SQLite layer
stores list-valued fields (goals, injuries, rest_days, available_equipment) as
JSON-encoded TEXT; the router does that (de)serialisation, so here they are
plain Python lists.
"""

from typing import Optional

from pydantic import BaseModel, Field


class ProfileIn(BaseModel):
    """Profile fields accepted from the client on POST /api/profile.

    ``name`` and ``fitness_level`` are required (the frontend enforces this too);
    everything else is optional with sensible defaults.
    """

    name: str
    age: Optional[int] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    fitness_level: str
    goals: list[str] = Field(default_factory=list)
    injuries: list[str] = Field(default_factory=list)
    rest_days: list[str] = Field(default_factory=list)
    available_equipment: list[str] = Field(default_factory=lambda: ["none"])
    diet_module_enabled: bool = False


class ProfileOut(BaseModel):
    """Profile as returned to the client, including server-managed fields."""

    id: int
    name: Optional[str] = None
    age: Optional[int] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    fitness_level: Optional[str] = None
    goals: list[str] = Field(default_factory=list)
    injuries: list[str] = Field(default_factory=list)
    rest_days: list[str] = Field(default_factory=list)
    available_equipment: list[str] = Field(default_factory=list)
    diet_module_enabled: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
