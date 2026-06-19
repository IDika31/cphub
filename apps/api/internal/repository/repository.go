package repository

import (
	"github.com/IDika31/cphub/api/internal/model"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type UserRepository struct{ db *gorm.DB }
type ProblemRepository struct{ db *gorm.DB }
type SubmissionRepository struct{ db *gorm.DB }

func NewUserRepository(db *gorm.DB) *UserRepository       { return &UserRepository{db} }
func NewProblemRepository(db *gorm.DB) *ProblemRepository   { return &ProblemRepository{db} }
func NewSubmissionRepository(db *gorm.DB) *SubmissionRepository { return &SubmissionRepository{db} }

// User
func (r *UserRepository) FindByID(id uuid.UUID) (*model.User, error) {
	var u model.User
	err := r.db.First(&u, "id = ?", id).Error
	if err != nil { return nil, err }
	return &u, nil
}

func (r *UserRepository) FindByEmail(email string) (*model.User, error) {
	var u model.User
	err := r.db.First(&u, "email = ?", email).Error
	if err != nil { return nil, err }
	return &u, nil
}

func (r *UserRepository) Create(u *model.User) error { return r.db.Create(u).Error }
func (r *UserRepository) Update(u *model.User) error  { return r.db.Save(u).Error }

// Problem
func (r *ProblemRepository) FindAll(filter map[string]interface{}, limit, offset int) ([]model.Problem, int64, error) {
	var problems []model.Problem
	var total int64
	query := r.db.Model(&model.Problem{})

	if provider, ok := filter["provider"]; ok {
		query = query.Where("provider = ?", provider)
	}
	if tag, ok := filter["tag"]; ok {
		query = query.Where("tags LIKE ?", "%"+tag.(string)+"%")
	}
	if difficulty, ok := filter["difficulty"]; ok {
		query = query.Where("difficulty = ?", difficulty)
	}
	if status, ok := filter["status"]; ok {
		query = query.Where("status = ?", status)
	}

	query.Count(&total)
	err := query.Order("created_at DESC").Limit(limit).Offset(offset).Preload("TestCases").Find(&problems).Error
	return problems, total, err
}

func (r *ProblemRepository) FindByID(id uuid.UUID) (*model.Problem, error) {
	var p model.Problem
	err := r.db.Preload("TestCases").First(&p, "id = ?", id).Error
	if err != nil { return nil, err }
	return &p, nil
}

func (r *ProblemRepository) FindByProviderAndID(provider, problemID string) (*model.Problem, error) {
	var p model.Problem
	err := r.db.Where("provider = ? AND problem_id = ?", provider, problemID).Preload("TestCases").First(&p).Error
	if err != nil { return nil, err }
	return &p, nil
}

func (r *ProblemRepository) FindByProblemID(problemID string) (*model.Problem, error) {
	var p model.Problem
	err := r.db.Where("problem_id = ?", problemID).Preload("TestCases").First(&p).Error
	if err != nil { return nil, err }
	return &p, nil
}

func (r *ProblemRepository) Upsert(p *model.Problem) error {
	existing, err := r.FindByProviderAndID(p.Provider, p.ProblemID)
	if err != nil {
		return r.db.Create(p).Error
	}
	p.ID = existing.ID
	// Update problem fields
	if err := r.db.Model(existing).Updates(p).Error; err != nil {
		return err
	}
	// Replace test cases: delete old, create new
	if len(p.TestCases) > 0 {
		r.db.Where("problem_id = ?", existing.ID).Delete(&model.TestCase{})
		for i := range p.TestCases {
			p.TestCases[i].ID = uuid.New()
			p.TestCases[i].ProblemID = existing.ID
		}
		return r.db.Create(&p.TestCases).Error
	}
	return nil
}

func (r *ProblemRepository) Search(query string, limit int) ([]model.Problem, error) {
	var problems []model.Problem
	err := r.db.Where("title ILIKE ? OR statement ILIKE ?", "%"+query+"%", "%"+query+"%").
		Limit(limit).Find(&problems).Error
	return problems, err
}

// Submission
func (r *SubmissionRepository) FindLocalByUser(userID uuid.UUID, limit, offset int) ([]model.LocalSubmission, int64, error) {
	var subs []model.LocalSubmission
	var total int64
	r.db.Model(&model.LocalSubmission{}).Where("user_id = ?", userID).Count(&total)
	err := r.db.Preload("Problem").Where("user_id = ?", userID).Order("created_at DESC").Limit(limit).Offset(offset).Find(&subs).Error
	return subs, total, err
}

func (r *SubmissionRepository) CreateLocal(sub *model.LocalSubmission) error {
	return r.db.Create(sub).Error
}

func (r *SubmissionRepository) FindExternalByUser(userID uuid.UUID, provider string, limit, offset int) ([]model.ExternalSubmission, int64, error) {
	var subs []model.ExternalSubmission
	var total int64
	query := r.db.Model(&model.ExternalSubmission{}).Where("user_id = ?", userID)
	if provider != "" {
		query = query.Where("provider = ?", provider)
	}
	query.Count(&total)
	err := query.Order("submitted_at DESC").Limit(limit).Offset(offset).Find(&subs).Error
	return subs, total, err
}

func (r *SubmissionRepository) CreateExternal(sub *model.ExternalSubmission) error {
	return r.db.Where("provider = ? AND submission_id = ?", sub.Provider, sub.SubmissionID).
		FirstOrCreate(sub).Error
}
