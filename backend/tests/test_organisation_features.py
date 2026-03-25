"""Tests for OrganisationFeature model and feature-gating."""

from sqlalchemy import select

from app.models import OrganisationFeature, Organization, User
from app.security import hash_password

# ---------------------------------------------------------------------------
# Model tests
# ---------------------------------------------------------------------------


class TestOrganisationFeatureModel:
    """CRUD and constraint tests for OrganisationFeature."""

    def test_create_feature(self, db_session):
        """Creating a feature row enables it for the org."""
        org = Organization(name="Test Org")
        db_session.add(org)
        db_session.flush()

        feature = OrganisationFeature(
            organisation_id=org.id,
            feature_key="teaching",
        )
        db_session.add(feature)
        db_session.commit()

        result = db_session.scalar(
            select(OrganisationFeature).where(
                OrganisationFeature.organisation_id == org.id,
            )
        )
        assert result is not None
        assert result.feature_key == "teaching"
        assert result.enabled_at is not None

    def test_unique_constraint(self, db_session):
        """Cannot enable the same feature twice on one org."""
        import pytest
        from sqlalchemy.exc import IntegrityError

        org = Organization(name="Test Org")
        db_session.add(org)
        db_session.flush()

        f1 = OrganisationFeature(
            organisation_id=org.id, feature_key="teaching"
        )
        f2 = OrganisationFeature(
            organisation_id=org.id, feature_key="teaching"
        )
        db_session.add(f1)
        db_session.flush()
        db_session.add(f2)
        with pytest.raises(IntegrityError):
            db_session.flush()

    def test_different_features_same_org(self, db_session):
        """Two different features on the same org is fine."""
        org = Organization(name="Test Org")
        db_session.add(org)
        db_session.flush()

        db_session.add_all(
            [
                OrganisationFeature(organisation_id=org.id, feature_key="epr"),
                OrganisationFeature(
                    organisation_id=org.id, feature_key="teaching"
                ),
            ]
        )
        db_session.commit()

        features = (
            db_session.execute(
                select(OrganisationFeature).where(
                    OrganisationFeature.organisation_id == org.id,
                )
            )
            .unique()
            .scalars()
            .all()
        )
        assert len(features) == 2

    def test_delete_disables_feature(self, db_session):
        """Removing the row disables the feature."""
        org = Organization(name="Test Org")
        db_session.add(org)
        db_session.flush()

        feature = OrganisationFeature(
            organisation_id=org.id, feature_key="teaching"
        )
        db_session.add(feature)
        db_session.commit()

        db_session.delete(feature)
        db_session.commit()

        remaining = db_session.scalar(
            select(OrganisationFeature).where(
                OrganisationFeature.organisation_id == org.id,
            )
        )
        assert remaining is None

    def test_cascade_delete_org(self, db_session):
        """Deleting the org cascades to its features."""
        org = Organization(name="Test Org")
        db_session.add(org)
        db_session.flush()

        db_session.add(
            OrganisationFeature(organisation_id=org.id, feature_key="epr")
        )
        db_session.commit()

        db_session.delete(org)
        db_session.commit()

        count = db_session.scalar(
            select(OrganisationFeature.id).where(
                OrganisationFeature.feature_key == "epr",
            )
        )
        assert count is None

    def test_organisation_features_relationship(self, db_session):
        """org.features returns the linked features."""
        org = Organization(name="Test Org")
        db_session.add(org)
        db_session.flush()

        db_session.add(
            OrganisationFeature(organisation_id=org.id, feature_key="teaching")
        )
        db_session.commit()
        db_session.refresh(org)

        assert len(org.features) == 1
        assert org.features[0].feature_key == "teaching"


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------


def _make_admin(db_session) -> User:
    """Create an admin user and return it."""
    user = User(
        username="featureadmin",
        email="featureadmin@example.com",
        password_hash=hash_password("AdminPassword123!"),
        is_active=True,
        system_permissions="admin",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _make_org(db_session, name: str = "Feature Org") -> Organization:
    org = Organization(name=name)
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    return org


class TestFeatureEndpoints:
    """API tests for /organizations/{id}/features endpoints."""

    def test_list_features_empty(self, test_client, db_session):
        """New org has no features."""
        _make_admin(db_session)
        org = _make_org(db_session)
        test_client.post(
            "/api/auth/login",
            json={
                "username": "featureadmin",
                "password": "AdminPassword123!",
            },
        )

        resp = test_client.get(f"/api/organizations/{org.id}/features")
        assert resp.status_code == 200
        assert resp.json()["features"] == []

    def test_enable_feature(self, test_client, db_session):
        """PUT with enabled=true creates the feature row."""
        _make_admin(db_session)
        org = _make_org(db_session)
        test_client.post(
            "/api/auth/login",
            json={
                "username": "featureadmin",
                "password": "AdminPassword123!",
            },
        )

        # Get CSRF token from cookies
        csrf = test_client.cookies.get("XSRF-TOKEN", "")

        resp = test_client.put(
            f"/api/organizations/{org.id}/features/teaching",
            json={"enabled": True},
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "enabled"

        # Verify via list
        resp = test_client.get(f"/api/organizations/{org.id}/features")
        features = resp.json()["features"]
        assert len(features) == 1
        assert features[0]["feature_key"] == "teaching"

    def test_enable_feature_idempotent(self, test_client, db_session):
        """Enabling an already-enabled feature returns already_enabled."""
        _make_admin(db_session)
        org = _make_org(db_session)
        test_client.post(
            "/api/auth/login",
            json={
                "username": "featureadmin",
                "password": "AdminPassword123!",
            },
        )
        csrf = test_client.cookies.get("XSRF-TOKEN", "")

        test_client.put(
            f"/api/organizations/{org.id}/features/teaching",
            json={"enabled": True},
            headers={"X-CSRF-Token": csrf},
        )
        resp = test_client.put(
            f"/api/organizations/{org.id}/features/teaching",
            json={"enabled": True},
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.json()["status"] == "already_enabled"

    def test_disable_feature(self, test_client, db_session):
        """PUT with enabled=false removes the row."""
        _make_admin(db_session)
        org = _make_org(db_session)
        test_client.post(
            "/api/auth/login",
            json={
                "username": "featureadmin",
                "password": "AdminPassword123!",
            },
        )
        csrf = test_client.cookies.get("XSRF-TOKEN", "")

        # Enable then disable
        test_client.put(
            f"/api/organizations/{org.id}/features/teaching",
            json={"enabled": True},
            headers={"X-CSRF-Token": csrf},
        )
        resp = test_client.put(
            f"/api/organizations/{org.id}/features/teaching",
            json={"enabled": False},
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.json()["status"] == "disabled"

        # Verify removed
        resp = test_client.get(f"/api/organizations/{org.id}/features")
        assert resp.json()["features"] == []

    def test_disable_nonexistent_feature(self, test_client, db_session):
        """Disabling a feature that was never enabled returns already_disabled."""
        _make_admin(db_session)
        org = _make_org(db_session)
        test_client.post(
            "/api/auth/login",
            json={
                "username": "featureadmin",
                "password": "AdminPassword123!",
            },
        )
        csrf = test_client.cookies.get("XSRF-TOKEN", "")

        resp = test_client.put(
            f"/api/organizations/{org.id}/features/teaching",
            json={"enabled": False},
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.json()["status"] == "already_disabled"

    def test_non_admin_cannot_list_features(self, test_client, db_session):
        """Non-admin gets 403 on feature list."""
        user = User(
            username="regularuser",
            email="regular@example.com",
            password_hash=hash_password("Password123!"),
            is_active=True,
            system_permissions="patient",
        )
        db_session.add(user)
        db_session.commit()

        org = _make_org(db_session)
        test_client.post(
            "/api/auth/login",
            json={"username": "regularuser", "password": "Password123!"},
        )

        resp = test_client.get(f"/api/organizations/{org.id}/features")
        assert resp.status_code == 403

    def test_non_admin_cannot_toggle_feature(self, test_client, db_session):
        """Non-admin gets 403 on feature toggle."""
        user = User(
            username="regularuser2",
            email="regular2@example.com",
            password_hash=hash_password("Password123!"),
            is_active=True,
            system_permissions="patient",
        )
        db_session.add(user)
        db_session.commit()

        org = _make_org(db_session)
        test_client.post(
            "/api/auth/login",
            json={"username": "regularuser2", "password": "Password123!"},
        )
        csrf = test_client.cookies.get("XSRF-TOKEN", "")

        resp = test_client.put(
            f"/api/organizations/{org.id}/features/teaching",
            json={"enabled": True},
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 403

    def test_feature_on_nonexistent_org(self, test_client, db_session):
        """Feature toggle on non-existent org returns 404."""
        _make_admin(db_session)
        test_client.post(
            "/api/auth/login",
            json={
                "username": "featureadmin",
                "password": "AdminPassword123!",
            },
        )
        csrf = test_client.cookies.get("XSRF-TOKEN", "")

        resp = test_client.put(
            "/api/organizations/99999/features/teaching",
            json={"enabled": True},
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# /auth/me enabled_features tests
# ---------------------------------------------------------------------------


class TestMeEnabledFeatures:
    """Verify /auth/me returns enabled_features."""

    def test_me_includes_enabled_features(self, test_client, db_session):
        """enabled_features reflects the user's primary org."""
        from app.models import organisation_staff_member

        org = _make_org(db_session)
        user = User(
            username="featureuser",
            email="fuser@example.com",
            password_hash=hash_password("Pass12345!"),
            is_active=True,
        )
        db_session.add(user)
        db_session.flush()

        # Link user to org as primary
        db_session.execute(
            organisation_staff_member.insert().values(
                organisation_id=org.id,
                user_id=user.id,
                is_primary=True,
            )
        )
        # Enable teaching on the org
        db_session.add(
            OrganisationFeature(
                organisation_id=org.id,
                feature_key="teaching",
            )
        )
        db_session.commit()

        test_client.post(
            "/api/auth/login",
            json={"username": "featureuser", "password": "Pass12345!"},
        )

        resp = test_client.get("/api/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert "enabled_features" in data
        assert "teaching" in data["enabled_features"]

    def test_me_no_org_empty_features(self, test_client, db_session):
        """User with no primary org gets an empty feature list."""
        user = User(
            username="noorgsuser",
            email="noorg@example.com",
            password_hash=hash_password("Pass12345!"),
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()

        test_client.post(
            "/api/auth/login",
            json={"username": "noorgsuser", "password": "Pass12345!"},
        )

        resp = test_client.get("/api/auth/me")
        assert resp.status_code == 200
        assert resp.json()["enabled_features"] == []
