import ItemForm from '@/components/manage/ItemForm';

export default function AddItemPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">
        Add New Item
      </h1>
      <ItemForm />
    </div>
  );
}
