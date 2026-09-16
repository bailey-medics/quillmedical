"""Relationships between places that are not ownership.

A medical school teaching on a trust's wards is a real relationship and
not ownership, so it is a link rather than a second parent. These tests
pin what a link is, what it is not, and who may record or remove one.

Covers:
- GET    /api/sites/{site_id}/links
- POST   /api/sites/{site_id}/links
- DELETE /api/sites/{site_id}/links/{link_id}
- The relation vocabulary, and what the model refuses
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Organisation,
    OrgUnit,
    OrgUnitLink,
    User,
)
from app.org_units.relations import (
    ORG_UNIT_RELATION_IDS,
    get_org_unit_relation,
    relation_grants_reach,
    validate_org_unit_relation,
)
from app.organisations import add_organisation_member


@pytest.fixture
def own_org(db_session: Session, test_admin: User) -> Organisation:
    org = Organisation(name="Own Trust", type="hospital_team")
    db_session.add(org)
    db_session.commit()
    add_organisation_member(db_session, org.id, test_admin.id, "staff")
    db_session.commit()
    return org


@pytest.fixture
def other_org(db_session: Session) -> Organisation:
    org = Organisation(name="Other Trust", type="hospital_team")
    db_session.add(org)
    db_session.commit()
    return org


def _site_of(db: Session, org: Organisation, name: str) -> OrgUnit:
    site = OrgUnit(name=name, type="ward", parent_id=org.org_unit_id)
    db.add(site)
    db.commit()
    db.refresh(site)
    return site


class TestTheRelationVocabulary:
    def test_the_four_relations_the_plan_names_are_defined(self) -> None:
        assert set(ORG_UNIT_RELATION_IDS) == {
            "hosts",
            "teaches_at",
            "partners_with",
            "shares_service",
        }

    def test_teaching_is_the_relation_that_grants_reach(self) -> None:
        """Reach, never admin rights and never membership."""
        assert relation_grants_reach("teaches_at") is True
        assert relation_grants_reach("hosts") is False
        assert relation_grants_reach("partners_with") is False
        assert relation_grants_reach("shares_service") is False

    def test_every_relation_is_described(self) -> None:
        for relation_id in ORG_UNIT_RELATION_IDS:
            relation = get_org_unit_relation(relation_id)
            assert relation is not None
            assert relation.display_name.strip()
            assert relation.description.strip()

    def test_an_unknown_relation_is_refused_by_name(self) -> None:
        with pytest.raises(ValueError) as exc_info:
            validate_org_unit_relation("owns")
        assert "owns" in str(exc_info.value)
        assert "teaches_at" in str(exc_info.value)

    def test_asking_about_an_unknown_relation_raises(self) -> None:
        with pytest.raises(ValueError):
            relation_grants_reach("owns")


class TestTheModelRefusesBadRows:
    def test_an_unknown_relation_cannot_be_stored(
        self, db_session, own_org
    ) -> None:
        a = _site_of(db_session, own_org, "A")
        b = _site_of(db_session, own_org, "B")
        with pytest.raises(ValueError):
            db_session.add(
                OrgUnitLink(source_id=a.id, target_id=b.id, relation="owns")
            )


class TestRecordingALink:
    def test_a_link_to_another_organisations_place_is_allowed(
        self, authenticated_admin_client, db_session, own_org, other_org
    ):
        """The relationships worth recording cross between organisations."""
        mine = _site_of(db_session, own_org, "My Ward")
        theirs = _site_of(db_session, other_org, "Their Ward")

        resp = authenticated_admin_client.post(
            f"/api/sites/{mine.id}/links",
            json={"target_id": theirs.id, "relation": "teaches_at"},
        )

        assert resp.status_code == 200
        links = resp.json()["links"]
        assert len(links) == 1
        assert links[0]["target_id"] == theirs.id
        assert links[0]["target_name"] == "Their Ward"
        assert links[0]["relation"] == "teaches_at"
        assert links[0]["relation_display_name"] == "Teaches at"

    def test_who_recorded_it_is_kept(
        self,
        authenticated_admin_client,
        db_session,
        own_org,
        other_org,
        test_admin,
    ):
        mine = _site_of(db_session, own_org, "My Ward")
        theirs = _site_of(db_session, other_org, "Their Ward")

        authenticated_admin_client.post(
            f"/api/sites/{mine.id}/links",
            json={"target_id": theirs.id, "relation": "hosts"},
        )

        created_by = db_session.execute(
            select(OrgUnitLink.created_by).where(
                OrgUnitLink.source_id == mine.id
            )
        ).scalar_one()
        assert created_by == test_admin.id

    def test_recording_the_same_link_twice_adds_one_row(
        self, authenticated_admin_client, db_session, own_org, other_org
    ):
        mine = _site_of(db_session, own_org, "My Ward")
        theirs = _site_of(db_session, other_org, "Their Ward")
        body = {"target_id": theirs.id, "relation": "partners_with"}

        authenticated_admin_client.post(
            f"/api/sites/{mine.id}/links", json=body
        )
        second = authenticated_admin_client.post(
            f"/api/sites/{mine.id}/links", json=body
        )

        assert second.status_code == 200
        assert len(second.json()["links"]) == 1

    def test_the_two_directions_are_different_facts(
        self, authenticated_superadmin_client, db_session, own_org, other_org
    ):
        """A school teaching at a trust is not the trust teaching at it."""
        mine = _site_of(db_session, own_org, "My Ward")
        theirs = _site_of(db_session, other_org, "Their Ward")

        authenticated_superadmin_client.post(
            f"/api/sites/{mine.id}/links",
            json={"target_id": theirs.id, "relation": "teaches_at"},
        )
        resp = authenticated_superadmin_client.post(
            f"/api/sites/{theirs.id}/links",
            json={"target_id": mine.id, "relation": "teaches_at"},
        )

        assert resp.status_code == 200
        assert len(resp.json()["links"]) == 2

    def test_linking_a_place_to_itself_is_refused(
        self, authenticated_admin_client, db_session, own_org
    ):
        mine = _site_of(db_session, own_org, "My Ward")

        resp = authenticated_admin_client.post(
            f"/api/sites/{mine.id}/links",
            json={"target_id": mine.id, "relation": "hosts"},
        )

        assert resp.status_code == 400

    def test_an_unknown_relation_is_refused(
        self, authenticated_admin_client, db_session, own_org, other_org
    ):
        mine = _site_of(db_session, own_org, "My Ward")
        theirs = _site_of(db_session, other_org, "Their Ward")

        resp = authenticated_admin_client.post(
            f"/api/sites/{mine.id}/links",
            json={"target_id": theirs.id, "relation": "owns"},
        )

        assert resp.status_code == 400
        assert "teaches_at" in resp.json()["detail"]

    def test_a_missing_target_is_refused(
        self, authenticated_admin_client, db_session, own_org
    ):
        mine = _site_of(db_session, own_org, "My Ward")

        resp = authenticated_admin_client.post(
            f"/api/sites/{mine.id}/links",
            json={"target_id": 999999, "relation": "hosts"},
        )

        assert resp.status_code == 404

    def test_linking_from_a_place_that_is_not_yours_is_refused(
        self, authenticated_admin_client, db_session, own_org, other_org
    ):
        mine = _site_of(db_session, own_org, "My Ward")
        theirs = _site_of(db_session, other_org, "Their Ward")

        resp = authenticated_admin_client.post(
            f"/api/sites/{theirs.id}/links",
            json={"target_id": mine.id, "relation": "hosts"},
        )

        assert resp.status_code == 404
        assert db_session.execute(select(OrgUnitLink)).first() is None


class TestReadingLinks:
    def test_both_directions_are_listed(
        self, authenticated_superadmin_client, db_session, own_org, other_org
    ):
        mine = _site_of(db_session, own_org, "My Ward")
        theirs = _site_of(db_session, other_org, "Their Ward")
        authenticated_superadmin_client.post(
            f"/api/sites/{theirs.id}/links",
            json={"target_id": mine.id, "relation": "teaches_at"},
        )

        resp = authenticated_superadmin_client.get(
            f"/api/sites/{mine.id}/links"
        )

        assert resp.status_code == 200
        links = resp.json()["links"]
        assert len(links) == 1
        assert links[0]["source_name"] == "Their Ward"
        assert links[0]["target_name"] == "My Ward"

    def test_a_place_with_no_links_reads_empty(
        self, authenticated_admin_client, db_session, own_org
    ):
        mine = _site_of(db_session, own_org, "My Ward")

        resp = authenticated_admin_client.get(f"/api/sites/{mine.id}/links")

        assert resp.status_code == 200
        assert resp.json()["links"] == []

    def test_reading_another_organisations_links_is_refused(
        self, authenticated_admin_client, db_session, other_org
    ):
        theirs = _site_of(db_session, other_org, "Their Ward")

        resp = authenticated_admin_client.get(f"/api/sites/{theirs.id}/links")

        assert resp.status_code == 404


class TestRemovingALink:
    def test_the_place_that_recorded_it_may_remove_it(
        self, authenticated_admin_client, db_session, own_org, other_org
    ):
        mine = _site_of(db_session, own_org, "My Ward")
        theirs = _site_of(db_session, other_org, "Their Ward")
        created = authenticated_admin_client.post(
            f"/api/sites/{mine.id}/links",
            json={"target_id": theirs.id, "relation": "hosts"},
        ).json()["links"][0]

        resp = authenticated_admin_client.delete(
            f"/api/sites/{mine.id}/links/{created['id']}"
        )

        assert resp.status_code == 200
        assert resp.json()["links"] == []

    def test_the_place_it_points_at_may_remove_it_too(
        self, authenticated_superadmin_client, db_session, own_org, other_org
    ):
        """A claim about your place is yours to withdraw."""
        mine = _site_of(db_session, own_org, "My Ward")
        theirs = _site_of(db_session, other_org, "Their Ward")
        created = authenticated_superadmin_client.post(
            f"/api/sites/{theirs.id}/links",
            json={"target_id": mine.id, "relation": "teaches_at"},
        ).json()["links"][0]

        resp = authenticated_superadmin_client.delete(
            f"/api/sites/{mine.id}/links/{created['id']}"
        )

        assert resp.status_code == 200
        assert db_session.execute(select(OrgUnitLink)).first() is None

    def test_removing_a_link_that_is_nothing_to_do_with_you_is_refused(
        self, authenticated_superadmin_client, db_session, own_org, other_org
    ):
        a = _site_of(db_session, other_org, "A")
        b = _site_of(db_session, other_org, "B")
        unrelated = _site_of(db_session, own_org, "Unrelated")
        created = authenticated_superadmin_client.post(
            f"/api/sites/{a.id}/links",
            json={"target_id": b.id, "relation": "hosts"},
        ).json()["links"][0]

        resp = authenticated_superadmin_client.delete(
            f"/api/sites/{unrelated.id}/links/{created['id']}"
        )

        assert resp.status_code == 404
        assert db_session.execute(select(OrgUnitLink)).first() is not None


class TestALinkConfersNothing:
    def test_it_does_not_make_the_other_place_visible(
        self, authenticated_admin_client, db_session, own_org, other_org
    ):
        """Reach is a later step, and admin rights never follow a link."""
        mine = _site_of(db_session, own_org, "My Ward")
        theirs = _site_of(db_session, other_org, "Their Ward")
        authenticated_admin_client.post(
            f"/api/sites/{mine.id}/links",
            json={"target_id": theirs.id, "relation": "teaches_at"},
        )

        assert (
            authenticated_admin_client.get(f"/api/sites/{theirs.id}")
        ).status_code == 404

        listed = authenticated_admin_client.get("/api/sites").json()["sites"]
        assert theirs.id not in [s["id"] for s in listed]
