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


class TestOrganizationModel:
    """Test Organization model."""

    def test_create_organization(self, db_session: Session):
        """Test creating an organization."""
        from app.models import Organization

        org = Organization(
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

    def test_organization_staff_relationship(self, db_session: Session):
        """Test organization staff member relationship."""
        from app.models import Organization, organisation_staff_member

        org = Organization(name="Test Clinic", type="clinic")
        user = User(
            username="doctor1",
            email="doctor1@example.com",
            password_hash=hash_password("password"),
        )

        db_session.add_all([org, user])
        db_session.commit()

        # Add user as staff member
        from sqlalchemy import insert

        stmt = insert(organisation_staff_member).values(
            organisation_id=org.id, user_id=user.id, is_primary=True
        )
        db_session.execute(stmt)
        db_session.commit()
        db_session.refresh(org)

        assert len(org.staff_members) == 1
        assert org.staff_members[0].username == "doctor1"

    def test_organization_patient_relationship(self, db_session: Session):
        """Test organization patient member association table."""
        from sqlalchemy import func, insert, select

        from app.models import Organization, organisation_patient_member

        org = Organization(name="Test Practice", type="general_practice")
        db_session.add(org)
        db_session.commit()

        # Add patient IDs directly to the association table
        stmt1 = insert(organisation_patient_member).values(
            organisation_id=org.id,
            patient_id="patient-123",
            is_primary=True,
        )
        stmt2 = insert(organisation_patient_member).values(
            organisation_id=org.id,
            patient_id="patient-456",
            is_primary=False,
        )
        db_session.execute(stmt1)
        db_session.execute(stmt2)
        db_session.commit()

        # Count patients in organization
        patient_count = db_session.scalar(
            select(func.count())
            .select_from(organisation_patient_member)
            .where(organisation_patient_member.c.organisation_id == org.id)
        )
        assert patient_count == 2

        # Verify primary flag
        primary_patients = (
            db_session.execute(
                select(organisation_patient_member.c.patient_id)
                .where(organisation_patient_member.c.organisation_id == org.id)
                .where(organisation_patient_member.c.is_primary.is_(True))
            )
            .scalars()
            .all()
        )
        assert len(primary_patients) == 1
        assert "patient-123" in primary_patients

    def test_organization_primary_flag(self, db_session: Session):
        """Test is_primary flag on staff membership."""
        from sqlalchemy import insert, select

        from app.models import Organization, organisation_staff_member

        org1 = Organization(name="Primary Clinic", type="clinic")
        org2 = Organization(name="Secondary Clinic", type="clinic")
        user = User(
            username="doctor2",
            email="doctor2@example.com",
            password_hash=hash_password("password"),
        )

        db_session.add_all([org1, org2, user])
        db_session.commit()

        # Add to org1 as primary
        stmt1 = insert(organisation_staff_member).values(
            organisation_id=org1.id, user_id=user.id, is_primary=True
        )
        db_session.execute(stmt1)

        # Add to org2 as non-primary
        stmt2 = insert(organisation_staff_member).values(
            organisation_id=org2.id, user_id=user.id, is_primary=False
        )
        db_session.execute(stmt2)
        db_session.commit()

        # Query primary membership
        stmt = select(organisation_staff_member).where(
            organisation_staff_member.c.user_id == user.id,
            organisation_staff_member.c.is_primary == True,  # noqa: E712
        )
        result = db_session.execute(stmt).first()

        assert result is not None
        assert result.organisation_id == org1.id
