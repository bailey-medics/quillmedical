"""Tests for database models."""

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Role, User
from app.security import hash_password


class TestUserModel:
    """Test User model."""

    def test_create_user(self, db_session: Session):
        """Test creating a user."""
        user = User(
            username="newuser",
            email="new@example.com",
            password_hash=hash_password("password123"),
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

        assert user.id is not None
        assert user.username == "newuser"
        assert user.email == "new@example.com"
        assert user.is_active is True
        assert user.totp_secret is None
        assert user.is_totp_enabled is False

    def test_user_unique_username(self, db_session: Session, test_user: User):
        """Test that username must be unique."""
        duplicate_user = User(
            username=test_user.username,  # Same username
            email="different@example.com",
            password_hash=hash_password("password"),
        )
        db_session.add(duplicate_user)

        with pytest.raises(IntegrityError):
            db_session.commit()

    def test_user_unique_email(self, db_session: Session, test_user: User):
        """Test that email must be unique."""
        duplicate_user = User(
            username="differentuser",
            email=test_user.email,  # Same email
            password_hash=hash_password("password"),
        )
        db_session.add(duplicate_user)

        with pytest.raises(IntegrityError):
            db_session.commit()

    def test_user_default_values(self, db_session: Session):
        """Test user default values."""
        user = User(
            username="defaultuser",
            email="default@example.com",
            password_hash=hash_password("password"),
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

        # Default values
        assert user.is_active is True
        assert user.is_totp_enabled is False
        assert user.totp_secret is None

    def test_user_totp_fields(self, db_session: Session):
        """Test TOTP-related fields."""
        user = User(
            username="totpuser",
            email="totp@example.com",
            password_hash=hash_password("password"),
            totp_secret="JBSWY3DPEHPK3PXP",
            is_totp_enabled=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

        assert user.totp_secret == "JBSWY3DPEHPK3PXP"
        assert user.is_totp_enabled is True

    def test_user_relationships(self, db_session: Session):
        """Test user has roles relationship."""
        user = User(
            username="reluser",
            email="rel@example.com",
            password_hash=hash_password("password"),
        )
        db_session.add(user)
        db_session.commit()

        # Should have empty roles list
        assert hasattr(user, "roles")
        assert isinstance(user.roles, list)
        assert len(user.roles) == 0


class TestRoleModel:
    """Test Role model."""

    def test_create_role(self, db_session: Session):
        """Test creating a role."""
        role = Role(name="TestRole")
        db_session.add(role)
        db_session.commit()
        db_session.refresh(role)

        assert role.id is not None
        assert role.name == "TestRole"

    def test_role_unique_name(self, db_session: Session):
        """Test that role name must be unique."""
        role1 = Role(name="UniqueRole")
        db_session.add(role1)
        db_session.commit()

        role2 = Role(name="UniqueRole")  # Same name
        db_session.add(role2)

        with pytest.raises(IntegrityError):
            db_session.commit()

    def test_role_relationships(self, db_session: Session):
        """Test role has users relationship."""
        role = Role(name="RelRole")
        db_session.add(role)
        db_session.commit()

        # Should have empty users list
        assert hasattr(role, "users")
        assert isinstance(role.users, list)
        assert len(role.users) == 0


class TestUserRoleRelationship:
    """Test many-to-many relationship between User and Role."""

    def test_assign_role_to_user(self, db_session: Session):
        """Test assigning a role to a user."""
        user = User(
            username="roleuser",
            email="roleuser@example.com",
            password_hash=hash_password("password"),
        )
        role = Role(name="TestRole")

        db_session.add(user)
        db_session.add(role)
        db_session.commit()

        # Assign role to user
        user.roles.append(role)
        db_session.commit()
        db_session.refresh(user)

        # Verify relationship
        assert len(user.roles) == 1
        assert user.roles[0].name == "TestRole"

    def test_assign_multiple_roles(self, db_session: Session):
        """Test assigning multiple roles to a user."""
        user = User(
            username="multirole",
            email="multirole@example.com",
            password_hash=hash_password("password"),
        )
        role1 = Role(name="Role1")
        role2 = Role(name="Role2")
        role3 = Role(name="Role3")

        db_session.add_all([user, role1, role2, role3])
        db_session.commit()

        # Assign multiple roles
        user.roles.extend([role1, role2, role3])
        db_session.commit()
        db_session.refresh(user)

        # Verify relationships
        assert len(user.roles) == 3
        role_names = {r.name for r in user.roles}
        assert role_names == {"Role1", "Role2", "Role3"}

    def test_role_has_multiple_users(self, db_session: Session):
        """Test a role can be assigned to multiple users."""
        role = Role(name="SharedRole")
        user1 = User(
            username="user1",
            email="user1@example.com",
            password_hash=hash_password("password"),
        )
        user2 = User(
            username="user2",
            email="user2@example.com",
            password_hash=hash_password("password"),
        )

        db_session.add_all([role, user1, user2])
        db_session.commit()

        # Assign same role to both users
        user1.roles.append(role)
        user2.roles.append(role)
        db_session.commit()
        db_session.refresh(role)

        # Verify relationship from role side
        assert len(role.users) == 2
        usernames = {u.username for u in role.users}
        assert usernames == {"user1", "user2"}

    def test_remove_role_from_user(self, db_session: Session):
        """Test removing a role from a user."""
        user = User(
            username="removeuser",
            email="remove@example.com",
            password_hash=hash_password("password"),
        )
        role = Role(name="RemoveRole")

        db_session.add_all([user, role])
        db_session.commit()

        # Assign and then remove
        user.roles.append(role)
        db_session.commit()
        assert len(user.roles) == 1

        user.roles.remove(role)
        db_session.commit()
        db_session.refresh(user)

        assert len(user.roles) == 0

    def test_eager_loading_roles(
        self, db_session: Session, test_clinician: User
    ):
        """Test that roles are eagerly loaded with User."""
        # Query user from database
        from sqlalchemy import select

        stmt = select(User).where(User.id == test_clinician.id)
        # When joined eager loads against collections are present, the
        # Result may contain duplicate rows for the same entity. Call
        # `unique()` to collapse duplicates before extracting the scalar.
        user = db_session.execute(stmt).unique().scalar_one()

        # Roles should be loaded (no additional query)
        # This is because of lazy="joined" in the relationship
        assert len(user.roles) > 0
        assert user.roles[0].name == "Clinician"


class TestOrganisationModel:
    """Test Organisation model."""

    def test_create_organisation(self, db_session: Session):
        """Test creating an organisation."""
        from app.models import Organisation

        org = Organisation(
            name="Test Hospital",
            type="hospital",
            location="London, UK",
        )
        db_session.add(org)
        db_session.commit()
        db_session.refresh(org)

        assert org.id is not None
        assert org.name == "Test Hospital"
        assert org.type == "hospital"
        assert org.location == "London, UK"
        assert org.created_at is not None
        assert org.updated_at is not None

    def test_organisation_staff_relationship(self, db_session: Session):
        """Test organisation staff member relationship."""
        from app.models import Organisation, organisation_member

        org = Organisation(name="Test Clinic", type="clinic")
        user = User(
            username="doctor1",
            email="doctor1@example.com",
            password_hash=hash_password("password"),
        )

        db_session.add_all([org, user])
        db_session.commit()

        # Add user as staff member
        from sqlalchemy import insert

        stmt = insert(organisation_member).values(
            organisation_id=org.id, user_id=user.id
        )
        db_session.execute(stmt)
        db_session.commit()
        db_session.refresh(org)

        assert len(org.staff_members) == 1
        assert org.staff_members[0].username == "doctor1"

    def test_organisation_patient_relationship(self, db_session: Session):
        """Test organisation patient member association table."""
        from sqlalchemy import func, insert, select

        from app.models import Organisation, organisation_patient_member

        org = Organisation(name="Test Practice", type="general_practice")
        db_session.add(org)
        db_session.commit()

        # Add patient IDs directly to the association table
        stmt1 = insert(organisation_patient_member).values(
            organisation_id=org.id,
            patient_id="patient-123",
        )
        stmt2 = insert(organisation_patient_member).values(
            organisation_id=org.id,
            patient_id="patient-456",
        )
        db_session.execute(stmt1)
        db_session.execute(stmt2)
        db_session.commit()

        # Count patients in organisation
        patient_count = db_session.scalar(
            select(func.count())
            .select_from(organisation_patient_member)
            .where(organisation_patient_member.c.organisation_id == org.id)
        )
        assert patient_count == 2


class TestModuleMediaLink:
    """The link between an MDX media reference and an uploaded file.

    The reference is a stable key, not a filename, so the mapping has to
    be stored rather than derived — media arrives through the admin
    upload UI, not the content repository.
    """

    def _org(self, db: Session, name: str):
        from app.models import Organisation

        org = Organisation(name=name)
        db.add(org)
        db.flush()
        return org

    def _link(self, db: Session, org_id: int, key: str, asset: str):
        from datetime import UTC, datetime

        from app.features.teaching.models import ModuleMediaLink

        link = ModuleMediaLink(
            organisation_id=org_id,
            question_bank_id="test-bank",
            media_key=key,
            asset_id=asset,
            original_filename="EoEETA_Colonoscopy_FINAL_v3.mp4",
            content_type="video/mp4",
            size_bytes=943718400,
            uploaded_at=datetime.now(UTC),
        )
        db.add(link)
        return link

    def test_a_link_records_the_uploaded_file(self, db_session: Session):
        org = self._org(db_session, "Trust A")
        link = self._link(db_session, org.id, "lecture-01", "abc123")
        db_session.commit()

        assert link.id is not None
        # The original name is kept so the uploader recognises their own
        # file, but the asset id is what addresses the object.
        assert link.original_filename.endswith(".mp4")
        assert link.asset_id == "abc123"

    def test_one_video_per_reference(self, db_session: Session):
        """Two files cannot claim the same key in one module."""
        org = self._org(db_session, "Trust B")
        self._link(db_session, org.id, "lecture-01", "abc123")
        db_session.commit()

        self._link(db_session, org.id, "lecture-01", "def456")
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()

    def test_two_organisations_hold_their_own_copy(self, db_session: Session):
        """The same key in two organisations is two separate uploads.

        This is the property the per-organisation model exists for: the
        same MDX resolves to A's upload for A's learners and B's for
        B's, which is what keeps the video cookie's prefix honest.
        """
        a = self._org(db_session, "Trust C")
        b = self._org(db_session, "Trust D")
        self._link(db_session, a.id, "lecture-01", "asset-a")
        self._link(db_session, b.id, "lecture-01", "asset-b")
        db_session.commit()

        from app.features.teaching.models import ModuleMediaLink

        rows = (
            db_session.query(ModuleMediaLink)
            .filter(ModuleMediaLink.media_key == "lecture-01")
            .all()
        )
        assert {r.asset_id for r in rows} == {"asset-a", "asset-b"}

    def test_a_size_beyond_a_32_bit_integer_is_stored(
        self, db_session: Session
    ):
        """Lectures are large; size_bytes is a BigInteger for that reason."""
        org = self._org(db_session, "Trust E")
        link = self._link(db_session, org.id, "lecture-01", "big")
        link.size_bytes = 5_000_000_000
        db_session.commit()

        assert link.size_bytes == 5_000_000_000
